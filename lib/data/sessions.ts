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
import { createClient } from '@/lib/supabase/server'
import { requireUserId } from '@/lib/data/auth'
import { exerciseNameKey } from '@/lib/exercises/identity'
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
      week,
      status: 'planned' as const,
    }))

  if (toInsert.length === 0) return existingSessions

  const { data: inserted, error: iErr } = await supabase
    .from('sessions')
    .insert(toInsert)
    .select('*')
  if (iErr) throw iErr

  return [...existingSessions, ...((inserted as Session[]) ?? [])]
}

/**
 * Get the session for a specific day + week, creating a 'planned' one if absent.
 */
export async function getSessionForDay(
  programId: string,
  dayId: string,
  week: number,
): Promise<Session> {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)

  const { data: existing, error: eErr } = await supabase
    .from('sessions')
    .select('*')
    .eq('program_id', programId)
    .eq('day_id', dayId)
    .eq('week', week)
    .eq('user_id', userId)
    .maybeSingle()
  if (eErr) throw eErr
  if (existing) return existing as Session

  const { data: inserted, error: iErr } = await supabase
    .from('sessions')
    .insert({
      user_id: userId,
      program_id: programId,
      day_id: dayId,
      week,
      status: 'planned',
    })
    .select('*')
    .single()
  if (iErr) throw iErr
  return inserted as Session
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
async function getPriorLogsByExercise(
  session: Session,
  slots: ExerciseSlot[],
  currentLogs: Record<string, SetLog>,
): Promise<Map<string, SetLog>> {
  const result = new Map<string, SetLog>()
  if (slots.length === 0) return result

  const supabase = await createClient()
  const userId = await requireUserId(supabase)
  const wanted = new Set(slots.map((slot) => exerciseNameKey(slot.exercise_name)))
  const { data: namedSlots, error: slotError } = await supabase
    .from('exercise_slots')
    .select('id, exercise_name')
    .eq('user_id', userId)
  if (slotError) throw slotError

  const nameBySlotId = new Map<string, string>()
  for (const row of (namedSlots ?? []) as Pick<ExerciseSlot, 'id' | 'exercise_name'>[]) {
    const key = exerciseNameKey(row.exercise_name)
    if (wanted.has(key)) nameBySlotId.set(row.id, key)
  }
  const matchingSlotIds = [...nameBySlotId.keys()]
  if (matchingSlotIds.length === 0) return result

  const currentLogTimes = Object.values(currentLogs)
    .map((log) => log.created_at)
    .filter(Boolean)
  const cutoff = currentLogTimes.sort()[0] ?? session.performed_at ?? new Date().toISOString()
  const { data: completedSessions, error: sessionError } = await supabase
    .from('sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'done')
    .neq('id', session.id)
    .not('performed_at', 'is', null)
    .lt('performed_at', cutoff)
    .order('performed_at', { ascending: false })
    .limit(500)
  if (sessionError) throw sessionError
  const completedSessionIds = (completedSessions ?? []).map(
    (row: { id: string }) => row.id,
  )
  if (completedSessionIds.length === 0) return result

  const { data: priorRows, error: logError } = await supabase
    .from('set_logs')
    .select('*')
    .eq('user_id', userId)
    .in('slot_id', matchingSlotIds)
    .in('session_id', completedSessionIds)
    .lt('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1000)
  if (logError) throw logError

  for (const log of (priorRows ?? []) as SetLog[]) {
    // Readiness-only rows are not a completed exercise dose and cannot seed a target.
    if (
      log.actual_load == null &&
      log.best_reps == null &&
      log.actual_sets == null &&
      log.actual_rir == null
    ) {
      continue
    }
    const key = nameBySlotId.get(log.slot_id)
    if (key && !result.has(key)) result.set(key, log)
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
  const priorLogs = await getPriorLogsByExercise(session, slots, logs)
  const entriesBySlot = await getSetEntriesForSession(session.id)

  return slots.map((slot) => {
    const config = slotConfigFromRow(slot)
    const log = logs[slot.id] ?? null
    const entries = entriesBySlot[slot.id] ?? []
    const priorLog = priorLogs.get(exerciseNameKey(slot.exercise_name))
    const prev = derivePrevTargets(config, priorLog, priorLog?.week ?? week - 1, deloadWeek)
    // A second occurrence during Week 1 should use the first occurrence's
    // calibrated result instead of resetting to the seed/base targets.
    const targetWeek = week === 1 && priorLog ? 2 : week

    const baseTargets: SlotTargets = {
      load: targetLoad(targetWeek, deloadWeek, config, prev.prevNextLoad),
      sets: targetSets(targetWeek, deloadWeek, config, prev.prevNextSets),
      reps: targetWeek === 1 ? config.repLow : prev.prevNextReps ?? config.repLow,
      rir: config.targetRir,
    }
    const ctx: EngineContext = {
      week,
      deloadWeek,
      prevNextLoad: prev.prevNextLoad,
      prevNextSets: prev.prevNextSets,
      prevNextReps: prev.prevNextReps,
      weights: weights ?? undefined,
    }
    const result = evaluateSlot(setLogInputFromRow(log), config, ctx)

    return { slot, log, entries, targets: baseTargets, result }
  })
}
