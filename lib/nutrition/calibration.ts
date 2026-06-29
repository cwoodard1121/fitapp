/**
 * Maintenance calibration — compare the loss your calorie deficit PREDICTS with
 * the loss your scale ACTUALLY shows, over a long window (the diet block). When
 * the two RATES persistently diverge, the maintenance estimate is probably off,
 * and we suggest a concrete nudge.
 *
 * Pure + server-usable. Uses RATES (units/week), not raw totals, so day-to-day
 * water-weight noise matters less and the comparison is fair across windows.
 */
import { differenceInCalendarDays, parseISO } from 'date-fns'

import type { BodyMetric, NutritionLog, Unit } from '@/lib/types'

import { accumulateDeficit, DEFAULT_WEIGHT_KG, kcalPerUnit } from './deficit'

export interface CalibrationInput {
  /** body_metrics ascending by measured_on. */
  bodyEntries: BodyMetric[]
  logs: NutritionLog[]
  stepsByDate: Record<string, number>
  maintenance: number | null
  stepBaseline: number
  /** Latest bodyweight in kg, for the step formula. */
  weightKg: number
  /** Outlier filter from the profile (null = off). */
  minCalories: number | null
  unit: Unit
  /** Window start (diet-block start, or a fallback). */
  windowStart: Date
  /** today's yyyy-MM-dd. */
  today: string
}

export interface CalibrationSuggestion {
  direction: 'lower' | 'raise'
  /** Suggested daily kcal change (magnitude). */
  kcal: number
  /** The resulting maintenance figure. */
  newMaintenance: number
}

export interface Calibration {
  status: 'ok' | 'insufficient' | 'no_maintenance'
  /** units/week, positive = losing. */
  predictedWeeklyLoss: number
  actualWeeklyLoss: number
  windowDays: number
  bodyReadings: number
  daysLogged: number
  /** Non-null only when status==='ok' and the rates diverge meaningfully. */
  suggestion: CalibrationSuggestion | null
  /** True when status==='ok' and the rates line up (no suggestion). */
  aligned: boolean
}

/** Least-squares slope (y per unit x); null if undetermined. */
function slope(points: { x: number; y: number }[]): number | null {
  const n = points.length
  if (n < 2) return null
  const sx = points.reduce((s, p) => s + p.x, 0)
  const sy = points.reduce((s, p) => s + p.y, 0)
  const sxx = points.reduce((s, p) => s + p.x * p.x, 0)
  const sxy = points.reduce((s, p) => s + p.x * p.y, 0)
  const denom = n * sxx - sx * sx
  if (denom === 0) return null
  return (n * sxy - sx * sy) / denom
}

// Thresholds for a trustworthy calibration ("over a long time").
const MIN_WINDOW_DAYS = 21
const MIN_BODY_READINGS = 6
const MIN_DAYS_LOGGED = 12
// A suggestion fires only on a tangible AND proportional gap.
const MIN_DAILY_KCAL_GAP = 100
const MIN_PROPORTIONAL_GAP = 0.25
const MAX_SUGGESTION_KCAL = 500

export function computeCalibration(input: CalibrationInput): Calibration {
  const {
    bodyEntries,
    logs,
    stepsByDate,
    maintenance,
    stepBaseline,
    weightKg,
    minCalories,
    unit,
    windowStart,
    today,
  } = input

  const perUnit = kcalPerUnit(unit)
  const todayD = parseISO(today)
  const windowDays = Math.max(0, differenceInCalendarDays(todayD, windowStart))

  // Actual rate: least-squares slope of bodyweight over the window.
  const inWindow = bodyEntries.filter((e) => {
    if (e.bodyweight == null) return false
    const d = parseISO(e.measured_on)
    return d >= windowStart && d <= todayD
  })
  const bodyReadings = inWindow.length
  const base = bodyReadings ? parseISO(inWindow[0].measured_on).getTime() : 0
  const pts = inWindow.map((e) => ({
    x: (parseISO(e.measured_on).getTime() - base) / 86_400_000,
    y: e.bodyweight as number,
  }))
  const s = slope(pts)
  const actualWeeklyLoss = s != null ? -s * 7 : 0

  if (maintenance == null) {
    return {
      status: 'no_maintenance',
      predictedWeeklyLoss: 0,
      actualWeeklyLoss,
      windowDays,
      bodyReadings,
      daysLogged: 0,
      suggestion: null,
      aligned: false,
    }
  }

  // Predicted rate: activity-adjusted deficit over the same window.
  const r = accumulateDeficit({
    logs,
    stepsByDate,
    baseMaint: maintenance,
    weightKg: weightKg > 0 ? weightKg : DEFAULT_WEIGHT_KG,
    stepBaseline,
    ignoreLow: minCalories != null,
    minCal: minCalories ?? 0,
    start: windowStart,
    end: todayD,
    today,
  })
  const avgDailyDeficit = r.daysLogged ? r.deficit / r.daysLogged : 0
  const predictedWeeklyLoss = (avgDailyDeficit * 7) / perUnit

  const enough =
    windowDays >= MIN_WINDOW_DAYS &&
    bodyReadings >= MIN_BODY_READINGS &&
    r.daysLogged >= MIN_DAYS_LOGGED &&
    s != null
  if (!enough) {
    return {
      status: 'insufficient',
      predictedWeeklyLoss,
      actualWeeklyLoss,
      windowDays,
      bodyReadings,
      daysLogged: r.daysLogged,
      suggestion: null,
      aligned: false,
    }
  }

  // Compare rates. gap > 0 => predicting MORE loss than the scale shows
  // => the deficit is overstated => maintenance estimate is too HIGH.
  const gap = predictedWeeklyLoss - actualWeeklyLoss
  const dailyOff = (gap * perUnit) / 7 // kcal/day
  const meaningful =
    Math.abs(dailyOff) >= MIN_DAILY_KCAL_GAP &&
    Math.abs(gap) >= MIN_PROPORTIONAL_GAP * Math.max(Math.abs(predictedWeeklyLoss), 0.3)

  let suggestion: CalibrationSuggestion | null = null
  if (meaningful) {
    const kcal = Math.min(MAX_SUGGESTION_KCAL, Math.round(Math.abs(dailyOff) / 50) * 50)
    if (kcal >= 50) {
      const direction: 'lower' | 'raise' = dailyOff > 0 ? 'lower' : 'raise'
      const newMaintenance = direction === 'lower' ? maintenance - kcal : maintenance + kcal
      suggestion = { direction, kcal, newMaintenance }
    }
  }

  return {
    status: 'ok',
    predictedWeeklyLoss,
    actualWeeklyLoss,
    windowDays,
    bodyReadings,
    daysLogged: r.daysLogged,
    suggestion,
    aligned: suggestion == null,
  }
}
