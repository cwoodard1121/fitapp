/**
 * Deterministic training analytics — REAL numbers computed in code (never by the
 * LLM). These are the grounded figures the AI layer interprets: per-lift e1RM
 * trends and rates, goal pacing / projections / ETAs, body trajectory, muscle
 * volume balance, nutrition adherence, and mesocycle position.
 *
 * Every numeric field is nullable: with thin data (e.g. Week 1) we return nulls
 * rather than guessing, so consumers can show "current value / %complete /
 * required-rate" even when there isn't enough history for a trend.
 */

/** Per-lift readout: engine-derived e1RM series collapsed to trend + rates. */
export interface LiftAnalytic {
  exercise: string
  muscleArea: string | null
  isBodyweight: boolean
  /** Number of logged sessions (set_log rows) for this lift. */
  sessions: number
  firstE1rm: number | null
  latestE1rm: number | null
  /** latest - first (rounded). */
  e1rmChange: number | null
  /** Percentage change from first to latest. */
  e1rmChangePct: number | null
  /** e1rmChange / max(1, weeks between first and latest). */
  weeklyE1rmRate: number | null
  latestLoad: number | null
  latestReps: number | null
  /** 'new' when there is too little data for a trend. */
  trend: 'up' | 'flat' | 'down' | 'new'
  /** The most recent next-session decision produced for this lift. */
  lastDecision: string | null
  stalled: boolean
}

/** Per-goal pacing: where it stands, how fast it must move, where it lands. */
export interface GoalAnalytic {
  id: string
  title: string
  metricType: string
  start: number | null
  current: number | null
  target: number | null
  unit: string | null
  /** 0..100 along start -> target (direction-aware). */
  pctComplete: number | null
  targetDate: string | null
  /** Whole days from now to the target date (may be negative if overdue). */
  daysToTarget: number | null
  /** (target - current) / weeks left to the target date. */
  requiredWeeklyRate: number | null
  /** Observed rate from recent history (slope for body; e1RM rate for lifts). */
  actualWeeklyRate: number | null
  /** ISO date (YYYY-MM-DD) the target is reached at the actual rate, or null. */
  projectedEta: string | null
  status: 'achieved' | 'ahead' | 'on_track' | 'behind' | 'no_data'
}

/** Bodyweight / composition trajectory over the readings window. */
export interface BodyAnalytic {
  latestWeight: number | null
  weightBasis: 'latest' | 'block_floor'
  weightChange: number | null
  /** Slope of bodyweight over the window (units per week). */
  weeklyRate: number | null
  latestBodyfat: number | null
  bodyfatBasis: 'interpreted' | 'bia' | 'none'
  bodyfatChange: number | null
  readings: number
  /**
   * True while the weekly rate is suppressed because we're still inside the
   * early-diet water-weight settling window (rate is null, not contaminated).
   */
  settling: boolean
}

/** Weekly volume for one muscle area, from the most recent logged week. */
export interface MuscleVolumeAnalytic {
  muscle: string
  weeklySets: number
  weeklyTonnage: number
}

/** Nutrition averages vs the active diet block's targets. */
export interface NutritionAnalytic {
  daysLogged: number
  avgCalories: number | null
  calorieTarget: number | null
  avgProtein: number | null
  proteinTarget: number | null
  /** 0..100 closeness of avg calories to the calorie target. */
  adherencePct: number | null
}

/** Where the user sits in the current mesocycle. */
export interface MesoAnalytic {
  programName: string
  week: number
  lengthWeeks: number
  weeksLeft: number
  deloadWeek: number
  isDeloadThisWeek: boolean
}

/** The full deterministic analytics bundle handed to the AI layer. */
export interface TrainingAnalytics {
  meso: MesoAnalytic
  lifts: LiftAnalytic[]
  goals: GoalAnalytic[]
  body: BodyAnalytic
  volume: MuscleVolumeAnalytic[]
  nutrition: NutritionAnalytic
}
