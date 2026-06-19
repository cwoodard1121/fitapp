import type {
  ExerciseSlot,
  Program,
  Session,
  SetLog,
  SlotTargets,
  SlotView,
} from '@/lib/types'
import type { EngineContext } from '@/lib/engine/engine'
import { evaluateSlot, targetLoad, targetSets } from '@/lib/engine/engine'
import { createClient } from '@/lib/supabase/server'
import { requireUserId } from '@/lib/data/auth'
import {
  derivePrevTargets,
  setLogInputFromRow,
  slotConfigFromRow,
  type PrevTargets,
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
 * Previous-week set_log for a single slot (week - 1). Null if none.
 */
async function getPrevWeekLog(
  slotId: string,
  week: number,
): Promise<SetLog | null> {
  if (week <= 1) return null
  const supabase = await createClient()
  const userId = await requireUserId(supabase)
  const { data, error } = await supabase
    .from('set_logs')
    .select('*')
    .eq('slot_id', slotId)
    .eq('week', week - 1)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as SetLog | null) ?? null
}

/**
 * Previous-week set_logs for many slots, keyed by slot_id. One query.
 */
async function getPrevWeekLogsForSlots(
  slotIds: string[],
  week: number,
): Promise<Record<string, SetLog>> {
  const map: Record<string, SetLog> = {}
  if (week <= 1 || slotIds.length === 0) return map

  const supabase = await createClient()
  const userId = await requireUserId(supabase)
  const { data, error } = await supabase
    .from('set_logs')
    .select('*')
    .in('slot_id', slotIds)
    .eq('week', week - 1)
    .eq('user_id', userId)
  if (error) throw error

  for (const row of (data as SetLog[]) ?? []) {
    // Keep the most recent if duplicates exist.
    const existing = map[row.slot_id]
    if (!existing || row.created_at > existing.created_at) {
      map[row.slot_id] = row
    }
  }
  return map
}

/**
 * Carry-forward targets implied by the previous week's logged set for a slot.
 * Computed on read by running the engine for week-1 (decisions are not stored).
 */
export async function getPrevDecisionForSlot(
  slotId: string,
  week: number,
): Promise<PrevTargets> {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)

  const { data: slot, error: sErr } = await supabase
    .from('exercise_slots')
    .select('*')
    .eq('id', slotId)
    .eq('user_id', userId)
    .maybeSingle()
  if (sErr) throw sErr
  if (!slot) {
    return { prevNextLoad: null, prevNextSets: null, prevNextReps: null }
  }
  const slotRow = slot as ExerciseSlot

  const deloadWeek = await getDeloadWeekForDay(slotRow.day_id)
  const prevLog = await getPrevWeekLog(slotId, week)

  return derivePrevTargets(slotConfigFromRow(slotRow), prevLog, week - 1, deloadWeek)
}

/**
 * Per-week targets for a slot using targetLoad/targetSets + the prior week.
 */
export async function computeSlotTargets(
  slot: ExerciseSlot,
  week: number,
  deloadWeek: number,
): Promise<SlotTargets> {
  const config = slotConfigFromRow(slot)
  const prevLog = await getPrevWeekLog(slot.id, week)
  const prev = derivePrevTargets(config, prevLog, week - 1, deloadWeek)

  return {
    load: targetLoad(week, deloadWeek, config, prev.prevNextLoad),
    sets: targetSets(week, deloadWeek, config, prev.prevNextSets),
    reps: week === 1 ? config.repLow : prev.prevNextReps ?? config.repLow,
    rir: config.targetRir,
  }
}

/**
 * Build the Today view: for each slot, attach its current log, the week's
 * targets, and the engine result. Batches previous-week lookups into one query.
 */
export async function buildTodayView(
  session: Session,
  slots: ExerciseSlot[],
  logs: Record<string, SetLog>,
  deloadWeek: number,
): Promise<SlotView[]> {
  const week = session.week
  const slotIds = slots.map((s) => s.id)
  const prevLogs = await getPrevWeekLogsForSlots(slotIds, week)

  return slots.map((slot) => {
    const config = slotConfigFromRow(slot)
    const log = logs[slot.id] ?? null
    const prev = derivePrevTargets(config, prevLogs[slot.id], week - 1, deloadWeek)

    const targets: SlotTargets = {
      load: targetLoad(week, deloadWeek, config, prev.prevNextLoad),
      sets: targetSets(week, deloadWeek, config, prev.prevNextSets),
      reps: week === 1 ? config.repLow : prev.prevNextReps ?? config.repLow,
      rir: config.targetRir,
    }

    const ctx: EngineContext = {
      week,
      deloadWeek,
      prevNextLoad: prev.prevNextLoad,
      prevNextSets: prev.prevNextSets,
      prevNextReps: prev.prevNextReps,
    }
    const result = evaluateSlot(setLogInputFromRow(log), config, ctx)

    return { slot, log, targets, result }
  })
}

/**
 * Resolve the deload_week for the program that owns a given day.
 */
async function getDeloadWeekForDay(dayId: string): Promise<number> {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)

  const { data: day, error: dErr } = await supabase
    .from('program_days')
    .select('program_id')
    .eq('id', dayId)
    .eq('user_id', userId)
    .maybeSingle()
  if (dErr) throw dErr
  if (!day) return 5

  const { data: program, error: pErr } = await supabase
    .from('programs')
    .select('deload_week')
    .eq('id', (day as { program_id: string }).program_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (pErr) throw pErr
  return (program as Pick<Program, 'deload_week'> | null)?.deload_week ?? 5
}
