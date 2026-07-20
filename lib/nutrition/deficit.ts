/**
 * Shared deficit math — the activity-adjusted calorie deficit used by the
 * nutrition tracker (client) AND the body-page maintenance check (server). One
 * source of truth so the two never drift.
 *
 * Pure + framework-free (no React, no server deps) so it imports cleanly into
 * both a client component and a server component.
 */
import { parseISO } from 'date-fns'

import type { NutritionLog } from '@/lib/types'

/** kcal per unit of bodyfat (approx): 3500/lb, 7700/kg. */
export const KCAL_PER_LB = 3500
export const KCAL_PER_KG = 7700

/**
 * Hard floor for COMPUTED STATS — deficit averages + maintenance calibration. The
 * user's tracking start: pre-cut data is noise and shouldn't feed the numbers. It
 * still imports and still shows in the charts/history — this only gates the math.
 * UTC; month 0-based.
 */
export const TRACKING_START = new Date(Date.UTC(2026, 5, 20)) // 2026-06-20

/** Step-based activity adjustment defaults. */
export const DEFAULT_STEP_BASELINE = 10000
export const KCAL_PER_STEP = 0.04
export const REF_WEIGHT_KG = 70
export const DEFAULT_WEIGHT_KG = 70

export interface DeficitInput {
  logs: NutritionLog[]
  stepsByDate: Record<string, number>
  baseMaint: number
  /** Latest bodyweight in KG, for the step formula. */
  weightKg: number
  stepBaseline: number
  /** When true, completed days under `minCal` are dropped (today is always kept). */
  ignoreLow: boolean
  minCal: number
  /** Inclusive window start. */
  start: Date
  /** Inclusive window end (usually today). */
  end: Date
  /** today's yyyy-MM-dd — the in-progress day, never outlier-filtered. */
  today: string
  /** Fraction of today elapsed (0..1); completed days are always counted in full. */
  currentDayProgress: number
}

export interface DeficitResult {
  daysLogged: number
  /** Full completed days plus the elapsed fraction of today, for rates/targets. */
  dayEquivalents: number
  ignoredLowDays: number
  /** + = under (adjusted) maintenance, i.e. a deficit. */
  deficit: number
  sumCalories: number
  sumMaint: number
  adjustedDays: number
  totalAdjustment: number
}

/** kcal per unit of tissue for the given weight unit. */
export function kcalPerUnit(unit: 'lb' | 'kg'): number {
  return unit === 'kg' ? KCAL_PER_KG : KCAL_PER_LB
}

/** Fraction of the current local calendar day that has elapsed (DST-safe). */
export function fractionOfDayElapsed(now: Date): number {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)

  return Math.min(
    1,
    Math.max(0, (now.getTime() - start.getTime()) / (end.getTime() - start.getTime())),
  )
}

/**
 * Sum the activity-adjusted deficit across logged days in [start, end]. The
 * current day's maintenance and step baseline accrue with elapsed time; prior
 * days remain full raw days.
 */
export function accumulateDeficit(input: DeficitInput): DeficitResult {
  const {
    logs,
    stepsByDate,
    baseMaint,
    weightKg,
    stepBaseline,
    ignoreLow,
    minCal,
    start,
    end,
    today,
    currentDayProgress,
  } = input

  let deficit = 0
  let sumCalories = 0
  let sumMaint = 0
  let daysLogged = 0
  let dayEquivalents = 0
  let ignoredLowDays = 0
  let adjustedDays = 0
  let totalAdjustment = 0

  for (const l of logs) {
    if (l.calories == null) continue
    const d = parseISO(l.logged_on)
    if (d < start || d > end) continue
    if (ignoreLow && l.logged_on !== today && l.calories < minCal) {
      ignoredLowDays += 1
      continue
    }

    const progress =
      l.logged_on === today ? Math.min(1, Math.max(0, currentDayProgress)) : 1
    const steps = stepsByDate[l.logged_on]
    const adjustment =
      steps != null
        ? (steps - stepBaseline * progress) *
          KCAL_PER_STEP *
          (weightKg / REF_WEIGHT_KG)
        : 0
    const dayMaint = baseMaint * progress + adjustment

    daysLogged += 1
    dayEquivalents += progress
    sumCalories += l.calories
    sumMaint += dayMaint
    deficit += dayMaint - l.calories
    if (adjustment !== 0) {
      adjustedDays += 1
      totalAdjustment += adjustment
    }
  }

  return {
    daysLogged,
    dayEquivalents,
    ignoredLowDays,
    deficit,
    sumCalories,
    sumMaint,
    adjustedDays,
    totalAdjustment,
  }
}
