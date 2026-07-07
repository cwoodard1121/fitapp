import type { Decision, GoalMetricType, GoalStatus, Unit } from "@/lib/types"
import type { WeightBasis } from "@/lib/body/metrics"

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

/**
 * A goal flattened for the progress page, with its automatically-derived
 * "current" value attached. `current` is null when the metric can't be derived
 * yet (custom goals, or no data). Shapes mirror the `goals` row so the shared
 * helpers in components/goals/progress.ts apply directly.
 */
export interface GoalProgressRow {
  id: string
  title: string
  metricType: GoalMetricType
  exerciseName: string | null
  startValue: number | null
  current: number | null
  targetValue: number | null
  targetUnit: string | null
  targetDate: string | null
  createdAt: string
  status: GoalStatus
}

/** One body measurement, plain and serialisable, for the body trend chart. */
export interface BodyTrendPoint {
  /** ISO date (measured_on). */
  date: string
  bodyweight: number | null
  bodyfat: number | null
  estimatedBodyfat: number | null
}

export interface ProgressData {
  exercises: ExerciseSeries[]
  volume: VolumeWeekRow[]
  muscleAreas: string[]
  unit: Unit
  defaultExercise: string | null
  /** Active goals first; empty when the user has no goals. */
  goals: GoalProgressRow[]
  /** Body measurements oldest -> newest; empty when none logged. */
  body: BodyTrendPoint[]
  bodyWeightCurrent: number | null
  bodyWeightRawLatest: number | null
  bodyWeightBasis: WeightBasis
  bodyWeightChange: number | null
}
