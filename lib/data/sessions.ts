import type {
  ExerciseSlot,
  Session,
  SetEntry,
  SetLog,
  SlotTargets,
  SlotView,
} from '@/lib/types'
import type { EngineContext, ReadinessWeights } from '@/lib/engine/engine'
import {
  evaluateSlot,
  targetLoad,
  targetSets,
} from '@/lib/engine/engine'
import { chooseVolumeIncreaseWinners } from '@/lib/engine/volume-arbitration'
import { createClient } from '@/lib/supabase/server'
import { requireUserId } from '@/lib/data/auth'
import { exerciseNameKey } from '@/lib/exercises/identity'
import {
  getSorenessBySessionAndMuscle,
  sorenessLookupKey,
} from '@/lib/data/soreness'
import {
  derivePrevTargets,
  setLogInputFromRow,
  slotConfigFromRow,
} from '@/lib/data/mappers'

/**
 * Create 'planned' sessions for every day of the given week that does not
 * already have one. Idempotent. Returns the full set of sessions for the week.
 */
export async function ensureWeekSessions(
  programId: string,
  week: number,
  mesocycle: number,
  scheduleVersion: string,
): Promise<Session[]> {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)

  const { data: days, error: dErr } = await supabase
    .from('program_days')
    .select('id')
    .eq('program_id', programId)
    .eq('user_id', userId)
  if (dErr) throw dErr
  const dayIds = (days as { id: string }[]).map((d) => d.id)

  const { data: existing, error: eErr } = await supabase
    .from('sessions')
    .select('*')
    .eq('program_id', programId)
    .eq('user_id', userId)
    .eq('schedule_version', scheduleVersion)
    .eq('mesocycle', mesocycle)
    .eq('week', week)
  if (eErr) throw eErr
  const existingSessions = (existing as Session[]) ?? []
  const haveDayIds = new Set(existingSessions.map((s) => s.day_id))

  const toInsert = dayIds
    .filter((id) => !haveDayIds.has(id))
    .map((dayId) => ({
      user_id: userId,
      program_id: programId,
      day_id: dayId,
      schedule_version: scheduleVersion,
      mesocycle,
      week,
      status: 'planned' as const,
    }))

  if (toInsert.length === 0) return existingSessions

  const { error: iErr } = await supabase
    .from('sessions')
    .upsert(toInsert, {
      onConflict:
        'user_id,program_id,schedule_version,mesocycle,week,day_id',
      ignoreDuplicates: true,
    })
  if (iErr) throw iErr

  // Another request may have won the same insert. Re-read the unique identity
  // so every caller receives the canonical session rows.
  const { data: complete, error: completeError } = await supabase
    .from('sessions')
    .select('*')
    .eq('program_id', programId)
    .eq('user_id', userId)
    .eq('schedule_version', scheduleVersion)
    .eq('mesocycle', mesocycle)
    .eq('week', week)
  if (completeError) throw completeError
  return (complete as Session[]) ?? []
}

/**
 * Get the session for a specific day + week, creating a 'planned' one if absent.
 */
export async function getSessionForDay(
  programId: string,
  dayId: string,
  week: number,
  mesocycle: number,
  scheduleVersion: string,
): Promise<Session> {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)

  const { data: existing, error: eErr } = await supabase
    .from('sessions')
    .select('*')
    .eq('program_id', programId)
    .eq('day_id', dayId)
    .eq('schedule_version', scheduleVersion)
    .eq('mesocycle', mesocycle)
    .eq('week', week)
    .eq('user_id', userId)
    .maybeSingle()
  if (eErr) throw eErr
  if (existing) return existing as Session

  const { error: iErr } = await supabase
    .from('sessions')
    .upsert(
      {
        user_id: userId,
        program_id: programId,
        day_id: dayId,
        schedule_version: scheduleVersion,
        mesocycle,
        week,
        status: 'planned',
      },
      {
        onConflict:
          'user_id,program_id,schedule_version,mesocycle,week,day_id',
        ignoreDuplicates: true,
      },
    )
  if (iErr) throw iErr

  const { data: canonical, error: canonicalError } = await supabase
    .from('sessions')
    .select('*')
    .eq('program_id', programId)
    .eq('day_id', dayId)
    .eq('schedule_version', scheduleVersion)
    .eq('mesocycle', mesocycle)
    .eq('week', week)
    .eq('user_id', userId)
    .single()
  if (canonicalError) throw canonicalError
  return canonical as Session
}

/**
 * Map of slot_id -> set_log for a session.
 */
export async function getSetLogsForSession(
  sessionId: string,
): Promise<Record<string, SetLog>> {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)
  const { data, error } = await supabase
    .from('set_logs')
    .select('*')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
  if (error) throw error

  const map: Record<string, SetLog> = {}
  for (const row of (data as SetLog[]) ?? []) {
    map[row.slot_id] = row
  }
  return map
}

/**
 * Map of slot_id -> ordered set_entries for a session.
 */
export async function getSetEntriesForSession(
  sessionId: string,
): Promise<Record<string, SetEntry[]>> {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)
  const { data, error } = await supabase
    .from('set_entries')
    .select('*')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .order('set_number', { ascending: true })
  if (error) throw error

  const map: Record<string, SetEntry[]> = {}
  for (const row of (data as SetEntry[]) ?? []) {
    ;(map[row.slot_id] ??= []).push(row)
  }
  return map
}

/**
 * Most recent log from a finished session for each exercise name before this
 * session. Slot ids are deliberately ignored: the same named exercise shares
 * history across days, programs, and casing differences.
 */
interface HistoricalExerciseLog {
  log: SetLog
  muscleArea: string | null
  nextDaySoreness: number | null
}

interface PriorExerciseLog extends HistoricalExerciseLog {
  /** Latest exposure outside deload, used to restore the full carry. */
  preDeload: HistoricalExerciseLog | null
}

async function getPriorLogsByExercise(
  session: Session,
  slots: ExerciseSlot[],
  currentLogs: Record<string, SetLog>,
  deloadWeek: number,
): Promise<Map<string, PriorExerciseLog>> {
  const result = new Map<string, PriorExerciseLog>()
  if (slots.length === 0) return result

  const supabase = await createClient()
  const userId = await requireUserId(supabase)
  const wanted = new Set(slots.map((slot) => exerciseNameKey(slot.exercise_name)))
  const { data: namedSlots, error: slotError } = await supabase
    .from('exercise_slots')
    .select('id, exercise_name, muscle_area')
    .eq('user_id', userId)
  if (slotError) throw slotError

  const metaBySlotId = new Map<
    string,
    { exerciseKey: string; muscleArea: string | null }
  >()
  for (const row of (namedSlots ?? []) as Pick<
    ExerciseSlot,
    'id' | 'exercise_name' | 'muscle_area'
  >[]) {
    const key = exerciseNameKey(row.exercise_name)
    if (wanted.has(key)) {
      metaBySlotId.set(row.id, {
        exerciseKey: key,
        muscleArea: row.muscle_area,
      })
    }
  }
  const matchingSlotIds = [...metaBySlotId.keys()]
  if (matchingSlotIds.length === 0) return result

  const currentLogTimes = Object.values(currentLogs)
    .map((log) => log.created_at)
    .filter(Boolean)
  const cutoff =
    session.performed_at ??
    currentLogTimes.sort()[0] ??
    new Date().toISOString()
  const { data: completedSessions, error: sessionError } = await supabase
    .from('sessions')
    .select('id, performed_at')
    .eq('user_id', userId)
    .eq('status', 'done')
    .neq('id', session.id)
    .not('performed_at', 'is', null)
    .lt('performed_at', cutoff)
    .order('performed_at', { ascending: false })
    .limit(500)
  if (sessionError) throw sessionError
  const completedSessionIds = (completedSessions ?? []).map(
    (row: { id: string; performed_at: string | null }) => row.id,
  )
  if (completedSessionIds.length === 0) return result
  const completedSessionRank = new Map(
    completedSessionIds.map((id, index) => [id, index]),
  )

  const [priorLogResult, sorenessBySessionMuscle] = await Promise.all([
    supabase
      .from('set_logs')
      .select('*')
      .eq('user_id', userId)
      .in('slot_id', matchingSlotIds)
      .in('session_id', completedSessionIds)
      .limit(1000),
    getSorenessBySessionAndMuscle(supabase, userId, completedSessionIds),
  ])
  const { data: priorRows, error: logError } = priorLogResult
  if (logError) throw logError

  const rankedPriorRows = [...((priorRows ?? []) as SetLog[])].sort((a, b) => {
    const sessionOrder =
      (completedSessionRank.get(a.session_id) ?? Number.MAX_SAFE_INTEGER) -
      (completedSessionRank.get(b.session_id) ?? Number.MAX_SAFE_INTEGER)
    return sessionOrder || b.created_at.localeCompare(a.created_at)
  })

  for (const log of rankedPriorRows) {
    const hasExerciseDose =
      log.actual_load != null ||
      log.best_reps != null ||
      log.actual_sets != null ||
      log.actual_rir != null
    const hasExerciseSafetyFeedback =
      log.pain != null || log.hit_rir_override === 'Skip'
    // Systemic-readiness-only rows cannot replace real exercise history. A
    // pain-only or explicitly skipped exposure can: its saved target snapshot
    // tells the next session exactly what to hold or reduce from.
    if (
      !hasExerciseDose &&
      !hasExerciseSafetyFeedback
    ) {
      continue
    }
    if (
      !hasExerciseDose &&
      hasExerciseSafetyFeedback &&
      log.target_load == null &&
      log.target_sets == null &&
      log.target_reps == null
    ) {
      // Legacy feedback rows predate target snapshots and cannot safely seed a
      // numeric prescription. Keep walking to the latest objective exposure.
      continue
    }
    const meta = metaBySlotId.get(log.slot_id)
    if (!meta) continue

    const historical: HistoricalExerciseLog = {
      log,
      muscleArea: meta.muscleArea,
      nextDaySoreness: meta.muscleArea
        ? (sorenessBySessionMuscle.get(
            sorenessLookupKey(log.session_id, meta.muscleArea),
          ) ?? null)
        : null,
    }
    const newest = result.get(meta.exerciseKey)
    if (!newest) {
      result.set(meta.exerciseKey, {
        ...historical,
        preDeload: null,
      })
    } else if (
      newest.preDeload == null &&
      log.week !== deloadWeek &&
      newest.log.session_id !== log.session_id
    ) {
      newest.preDeload = historical
    }
  }

  return result
}

/**
 * Build the Today view: for each slot, attach its current log, the week's
 * targets, and the engine result. Exercise history is shared by normalized name.
 */
export async function buildTodayView(
  session: Session,
  slots: ExerciseSlot[],
  logs: Record<string, SetLog>,
  deloadWeek: number,
  weights?: ReadinessWeights | null,
): Promise<SlotView[]> {
  const week = session.week
  const priorLogs = await getPriorLogsByExercise(
    session,
    slots,
    logs,
    deloadWeek,
  )
  const entriesBySlot = await getSetEntriesForSession(session.id)

  const prepared = slots.map((slot) => {
    const config = slotConfigFromRow(slot)
    const log = logs[slot.id] ?? null
    const entries = entriesBySlot[slot.id] ?? []
    const prior = priorLogs.get(exerciseNameKey(slot.exercise_name))
    const priorLog = prior?.log
    const carryIntoDeload =
      priorLog?.week === deloadWeek && prior?.preDeload
        ? derivePrevTargets(
            config,
            prior.preDeload.log,
            prior.preDeload.log.week,
            deloadWeek,
            weights,
            prior.preDeload.nextDaySoreness,
          )
        : null
    const prev = derivePrevTargets(
      config,
      priorLog,
      priorLog?.week ?? week - 1,
      deloadWeek,
      weights,
      prior?.nextDaySoreness,
      carryIntoDeload,
    )
    return { slot, config, log, entries, prior, priorLog, prev }
  })

  // The upcoming workout may add at most one set per muscle, even when its
  // exercises inherited feedback from different historical sessions. Lowest
  // prior pump wins (program order breaks ties); the others take normal
  // rep/load progression. This keeps volume additions genuinely sparse.
  const volumeWinnerIndexes = chooseVolumeIncreaseWinners(
    prepared.map((item) =>
      item.prev.decision === 'Add 1 set' &&
      item.slot.muscle_area
        ? {
            groupKey: sorenessLookupKey(
              session.id,
              item.slot.muscle_area,
            ),
            pump: item.prior?.log.pump ?? null,
          }
        : null,
    ),
  )

  return prepared.map((item, index) => {
    const { slot, config, log, entries, prior, priorLog } = item
    let prev = item.prev
    if (
      prev.decision === 'Add 1 set' &&
      slot.muscle_area &&
      prior &&
      !volumeWinnerIndexes.has(index)
    ) {
      prev = derivePrevTargets(
        config,
        prior.log,
        prior.log.week,
        deloadWeek,
        weights,
        null,
      )
    }
    // A second occurrence during Week 1 should use the first occurrence's
    // progressed targets instead of resetting to the seed/base targets.
    const targetWeek = week === 1 && priorLog ? 2 : week

    const baseTargets: SlotTargets = {
      load: targetLoad(targetWeek, deloadWeek, config, prev.prevNextLoad),
      sets: targetSets(targetWeek, deloadWeek, config, prev.prevNextSets),
      reps: targetWeek === 1 ? config.repLow : prev.prevNextReps ?? config.repLow,
      rir: config.targetRir,
    }
    // Once any exercise-specific feedback or set data snapshots a target, keep
    // showing and re-saving that exact prescription for the whole session.
    // Later feedback, slot edits, or another occurrence must not rewrite the
    // objective bar after the athlete has started against it.
    const displayedTargets: SlotTargets = {
      load: log?.target_load ?? baseTargets.load,
      sets: log?.target_sets ?? baseTargets.sets,
      reps: log?.target_reps ?? baseTargets.reps,
      rir: log?.target_rir ?? baseTargets.rir,
    }
    const ctx: EngineContext = {
      week,
      deloadWeek,
      prevNextLoad: prev.prevNextLoad,
      prevNextSets: prev.prevNextSets,
      prevNextReps: prev.prevNextReps,
      prescribedLoad: displayedTargets.load,
      prescribedSets: displayedTargets.sets,
      prescribedReps: displayedTargets.reps,
      prescribedRir: displayedTargets.rir,
      weights: weights ?? undefined,
    }
    const result = evaluateSlot(setLogInputFromRow(log), config, ctx)

    return { slot, log, entries, targets: displayedTargets, result }
  })
}
