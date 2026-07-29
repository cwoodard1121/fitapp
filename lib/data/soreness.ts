import type { SupabaseClient } from '@supabase/supabase-js'

import { requireUserId } from '@/lib/data/auth'
import { createClient } from '@/lib/supabase/server'
import type {
  ExerciseSlot,
  MuscleSorenessCheckin,
  ProgramDay,
  Session,
  SetLog,
} from '@/lib/types'

const CHECKIN_LOOKBACK_DAYS = 7
const APP_TIME_ZONE = process.env.APP_TIME_ZONE || 'America/Toronto'

export interface PendingSorenessMuscle {
  muscleArea: string
  soreness: number | null
}

export interface PendingSorenessCheckin {
  sessionId: string
  sessionLabel: string
  performedOn: string
  muscles: PendingSorenessMuscle[]
}

export function appCalendarDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const byType = new Map(parts.map((part) => [part.type, part.value]))
  return `${byType.get('year')}-${byType.get('month')}-${byType.get('day')}`
}

function normalizedMuscleArea(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

export function sorenessLookupKey(sessionId: string, muscleArea: string): string {
  return `${sessionId}:${normalizedMuscleArea(muscleArea)}`
}

/** Fetch next-day soreness values for completed-session engine inputs. */
export async function getSorenessBySessionAndMuscle(
  supabase: SupabaseClient,
  userId: string,
  sessionIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  if (sessionIds.length === 0) return result

  const { data, error } = await supabase
    .from('muscle_soreness_checkins')
    .select('session_id,muscle_area,soreness')
    .eq('user_id', userId)
    .in('session_id', sessionIds)
  if (error) throw error

  for (const row of (data ?? []) as Pick<
    MuscleSorenessCheckin,
    'session_id' | 'muscle_area' | 'soreness'
  >[]) {
    result.set(sorenessLookupKey(row.session_id, row.muscle_area), row.soreness)
  }
  return result
}

/**
 * Join muscle-level next-day feedback onto set logs for pure engine/analytics
 * consumers that otherwise only receive flat SetLog rows.
 */
export async function attachNextDaySorenessToLogs(
  supabase: SupabaseClient,
  userId: string,
  logs: SetLog[],
  slots: ExerciseSlot[],
): Promise<SetLog[]> {
  if (logs.length === 0 || slots.length === 0) return logs

  const sessionIds = [...new Set(logs.map((log) => log.session_id))]
  const soreness = await getSorenessBySessionAndMuscle(
    supabase,
    userId,
    sessionIds,
  )
  const muscleBySlot = new Map(
    slots.map((slot) => [slot.id, slot.muscle_area?.trim() || null]),
  )

  return logs.map((log) => {
    const muscleArea = muscleBySlot.get(log.slot_id)
    return {
      ...log,
      next_day_soreness: muscleArea
        ? (soreness.get(sorenessLookupKey(log.session_id, muscleArea)) ?? null)
        : null,
    }
  })
}

/**
 * Return the most recent completed session from a prior app-calendar day that
 * still needs muscle-level soreness feedback. Only muscles with actual logged
 * work are included; an old completed-but-empty session never creates a prompt.
 */
export async function getPendingSorenessCheckin(): Promise<PendingSorenessCheckin | null> {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)
  const today = appCalendarDate(new Date())
  const since = new Date(
    Date.now() - CHECKIN_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()

  const { data: sessionRows, error: sessionError } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'done')
    .not('performed_at', 'is', null)
    .gte('performed_at', since)
    .order('performed_at', { ascending: false })
    .limit(10)
  if (sessionError) throw sessionError

  const sessions = ((sessionRows ?? []) as Session[]).filter(
    (session) =>
      session.performed_at != null &&
      appCalendarDate(session.performed_at) < today,
  )
  if (sessions.length === 0) return null

  const sessionIds = sessions.map((session) => session.id)
  const dayIds = [...new Set(sessions.map((session) => session.day_id))]

  const [dayResult, slotResult, logResult, checkinResult] = await Promise.all([
    supabase
      .from('program_days')
      .select('id,label')
      .eq('user_id', userId)
      .in('id', dayIds),
    supabase
      .from('exercise_slots')
      .select('id,day_id,order_index,muscle_area,exercise_name')
      .eq('user_id', userId),
    supabase
      .from('set_logs')
      .select(
        'session_id,slot_id,actual_load,best_reps,actual_sets,actual_rir',
      )
      .eq('user_id', userId)
      .in('session_id', sessionIds),
    supabase
      .from('muscle_soreness_checkins')
      .select('session_id,muscle_area,soreness')
      .eq('user_id', userId)
      .in('session_id', sessionIds),
  ])

  if (dayResult.error) throw dayResult.error
  if (slotResult.error) throw slotResult.error
  if (logResult.error) throw logResult.error
  if (checkinResult.error) throw checkinResult.error

  const labelByDay = new Map(
    ((dayResult.data ?? []) as Pick<ProgramDay, 'id' | 'label'>[]).map((day) => [
      day.id,
      day.label,
    ]),
  )
  const slotById = new Map(
    (
      (slotResult.data ?? []) as Pick<
        ExerciseSlot,
        'id' | 'day_id' | 'order_index' | 'muscle_area' | 'exercise_name'
      >[]
    ).map((slot) => [slot.id, slot]),
  )
  const logsBySession = new Map<string, Pick<
    SetLog,
    | 'session_id'
    | 'slot_id'
    | 'actual_load'
    | 'best_reps'
    | 'actual_sets'
    | 'actual_rir'
  >[]>()
  for (const log of (logResult.data ?? []) as Pick<
    SetLog,
    | 'session_id'
    | 'slot_id'
    | 'actual_load'
    | 'best_reps'
    | 'actual_sets'
    | 'actual_rir'
  >[]) {
    const sessionLogs = logsBySession.get(log.session_id) ?? []
    sessionLogs.push(log)
    logsBySession.set(log.session_id, sessionLogs)
  }

  const sorenessBySessionMuscle = new Map<string, number>()
  for (const row of (checkinResult.data ?? []) as Pick<
    MuscleSorenessCheckin,
    'session_id' | 'muscle_area' | 'soreness'
  >[]) {
    sorenessBySessionMuscle.set(
      sorenessLookupKey(row.session_id, row.muscle_area),
      row.soreness,
    )
  }

  for (const session of sessions) {
    const workedSlots = (logsBySession.get(session.id) ?? [])
      .filter(
        (log) =>
          log.actual_load != null ||
          log.best_reps != null ||
          log.actual_sets != null ||
          log.actual_rir != null,
      )
      .map((log) => slotById.get(log.slot_id))
      .filter((slot): slot is NonNullable<typeof slot> => slot != null)
      .sort((a, b) => a.order_index - b.order_index)

    const seen = new Set<string>()
    const muscles: PendingSorenessMuscle[] = []
    for (const slot of workedSlots) {
      const muscleArea = slot.muscle_area?.trim()
      if (!muscleArea) continue
      const normalized = normalizedMuscleArea(muscleArea)
      if (seen.has(normalized)) continue
      seen.add(normalized)
      muscles.push({
        muscleArea,
        soreness:
          sorenessBySessionMuscle.get(
            sorenessLookupKey(session.id, muscleArea),
          ) ?? null,
      })
    }

    if (
      muscles.length > 0 &&
      muscles.some((muscle) => muscle.soreness == null)
    ) {
      return {
        sessionId: session.id,
        sessionLabel: labelByDay.get(session.day_id) ?? 'your last session',
        performedOn: appCalendarDate(session.performed_at!),
        muscles,
      }
    }
  }

  return null
}
