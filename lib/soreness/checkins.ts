import { differenceInCalendarDays, parseISO } from 'date-fns'

import type {
  ExerciseSlot,
  Session,
  SetLog,
  SorenessCheckInPrompt,
} from '@/lib/types'

export function normalizeMuscleKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function hasPerformedWork(
  log: Pick<SetLog, 'actual_sets' | 'best_reps'> &
    Partial<Pick<SetLog, 'actual_load' | 'actual_rir'>>,
): boolean {
  return (
    log.actual_load != null ||
    log.best_reps != null ||
    log.actual_sets != null ||
    log.actual_rir != null
  )
}

interface BuildPromptsInput {
  today: string
  sessions: Pick<Session, 'id' | 'performed_at'>[]
  logs: (Pick<SetLog, 'session_id' | 'slot_id' | 'actual_sets' | 'best_reps'> &
    Partial<Pick<SetLog, 'actual_load' | 'actual_rir'>>)[]
  slots: Pick<ExerciseSlot, 'id' | 'exercise_name' | 'muscle_area'>[]
  reportedMuscleKeys?: Iterable<string>
}

/**
 * Collapse eligible workout rows into one prompt per muscle. If the same muscle
 * was trained on both eligible days, the latest workout is the source so the
 * person never has to answer twice for that muscle on one day.
 */
export function buildSorenessCheckInPrompts({
  today,
  sessions,
  logs,
  slots,
  reportedMuscleKeys = [],
}: BuildPromptsInput): SorenessCheckInPrompt[] {
  const todayDate = parseISO(today)
  const reported = new Set(
    [...reportedMuscleKeys].map((key) => normalizeMuscleKey(key)),
  )
  const sessionById = new Map(
    sessions
      .filter((session) => session.performed_at != null)
      .map((session) => [session.id, session]),
  )
  const slotById = new Map(slots.map((slot) => [slot.id, slot]))
  const prompts = new Map<string, SorenessCheckInPrompt>()

  for (const log of logs) {
    if (!hasPerformedWork(log)) continue
    const session = sessionById.get(log.session_id)
    const slot = slotById.get(log.slot_id)
    const muscleArea = slot?.muscle_area?.trim()
    if (!session?.performed_at || !slot || !muscleArea) continue

    const daysAfter = differenceInCalendarDays(
      todayDate,
      new Date(session.performed_at),
    )
    if (daysAfter !== 1 && daysAfter !== 2) continue

    const muscleKey = normalizeMuscleKey(muscleArea)
    if (!muscleKey || reported.has(muscleKey)) continue

    const existing = prompts.get(muscleKey)
    if (!existing || session.performed_at > existing.performedAt) {
      prompts.set(muscleKey, {
        sourceSessionId: session.id,
        muscleKey,
        muscleArea,
        performedAt: session.performed_at,
        daysAfter,
        exerciseNames: [slot.exercise_name],
      })
      continue
    }

    if (
      existing.sourceSessionId === session.id &&
      !existing.exerciseNames.includes(slot.exercise_name)
    ) {
      existing.exerciseNames.push(slot.exercise_name)
    }
  }

  return [...prompts.values()]
    .map((prompt) => ({
      ...prompt,
      exerciseNames: prompt.exerciseNames.toSorted((a, b) => a.localeCompare(b)),
    }))
    .toSorted((a, b) => a.muscleArea.localeCompare(b.muscleArea))
}

export function mergeSorenessRating(
  workoutRating: number | null,
  delayedRatings: readonly number[],
): number | null {
  if (delayedRatings.length === 0) return workoutRating
  return Math.max(workoutRating ?? 0, ...delayedRatings)
}
