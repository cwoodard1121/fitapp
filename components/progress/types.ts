import type { Decision, Unit } from "@/lib/types"

/**
 * Plain, serialisable shapes the server component computes and hands to the
 * client chart components. No engine/Supabase imports leak across the boundary.
 */

/** One logged set for one exercise, with the engine's call attached. */
export interface ExercisePoint {
  /** ISO timestamp of the set_log (created_at). */
  date: string
  week: number
  e1rm: number | null
  load: number | null
  reps: number | null
  sets: number | null
  decision: Decision
  decisionLabel: string
  reason: string
}

/** All logged sets for one lift (grouped by exercise_name), oldest -> newest. */
export interface ExerciseSeries {
  name: string
  muscleArea: string | null
  logCount: number
  points: ExercisePoint[]
  /** detectStall() over the recent (e1rm, decision) samples. */
  stalled: boolean
  stallReason: string
  /** Most recent / best e1RM for the summary readout. */
  latestE1rm: number | null
  bestE1rm: number | null
  latestLoad: number | null
}

/** One week's tonnage broken out per muscle area (keys are muscle areas). */
export type VolumeWeekRow = { week: number } & Record<string, number>

export interface ProgressData {
  exercises: ExerciseSeries[]
  volume: VolumeWeekRow[]
  muscleAreas: string[]
  unit: Unit
  defaultExercise: string | null
}
