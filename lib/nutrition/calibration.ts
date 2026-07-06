/**
 * Maintenance calibration: compare the loss your calorie deficit predicts with
 * the loss your scale shows over the active diet block.
 *
 * The scale side uses a small water-weight guard. Abrupt high weigh-ins are
 * treated as likely water/glycogen noise and are smoothed down against nearby
 * stable readings, capped at 2% of baseline bodyweight.
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

export interface WaterWeightAdjustment {
  /** Number of weigh-ins smoothed as likely water spikes. */
  adjustedReadings: number
  /** Largest single-reading adjustment, in the user's bodyweight unit. */
  maxOffset: number
  /** Sum of all reading adjustments, in the user's bodyweight unit. */
  totalOffset: number
}

export interface Calibration {
  status: 'ok' | 'insufficient' | 'no_maintenance'
  /** units/week, positive = losing; water-smoothed on the scale side. */
  predictedWeeklyLoss: number
  actualWeeklyLoss: number
  windowDays: number
  bodyReadings: number
  daysLogged: number
  waterWeight: WaterWeightAdjustment
  /** Non-null only when status==='ok' and the rates diverge meaningfully. */
  suggestion: CalibrationSuggestion | null
  /** True when status==='ok' and the rates line up (no suggestion). */
  aligned: boolean
}

interface TrendPoint {
  x: number
  y: number
  date: string
}

/** Least-squares slope (y per unit x); null if undetermined. */
function slope(points: TrendPoint[]): number | null {
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

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function emptyWaterWeight(): WaterWeightAdjustment {
  return { adjustedReadings: 0, maxOffset: 0, totalOffset: 0 }
}

function isLowOutlier(log: NutritionLog, minCalories: number | null, today: string): boolean {
  return (
    minCalories != null &&
    log.logged_on !== today &&
    log.calories != null &&
    log.calories < minCalories
  )
}

function hasRecentTrackingNoise({
  date,
  logs,
  maintenance,
  reliableMedian,
  minCalories,
  today,
}: {
  date: string
  logs: NutritionLog[]
  maintenance: number | null
  reliableMedian: number | null
  minCalories: number | null
  today: string
}) {
  const bodyDate = parseISO(date)

  for (const log of logs) {
    if (log.calories == null) continue
    const daysAgo = differenceInCalendarDays(bodyDate, parseISO(log.logged_on))
    if (daysAgo < 0 || daysAgo > 2) continue

    if (isLowOutlier(log, minCalories, today)) return true

    const highVsMaintenance = maintenance != null && log.calories >= maintenance
    const highVsRecent =
      reliableMedian != null &&
      (log.calories >= reliableMedian + 300 || log.calories >= reliableMedian * 1.15)

    if (highVsMaintenance || highVsRecent) return true
  }

  return false
}

function applyWaterWeightGuard({
  entries,
  unit,
  logs,
  maintenance,
  minCalories,
  today,
}: {
  entries: BodyMetric[]
  unit: Unit
  logs: NutritionLog[]
  maintenance: number | null
  minCalories: number | null
  today: string
}) {
  if (entries.length === 0) {
    return {
      points: [],
      waterWeight: emptyWaterWeight(),
    }
  }

  const baseMs = parseISO(entries[0].measured_on).getTime()
  const raw = entries.map((e) => ({
    x: (parseISO(e.measured_on).getTime() - baseMs) / 86_400_000,
    y: e.bodyweight as number,
    date: e.measured_on,
  }))

  if (entries.length < 3) {
    return {
      points: raw,
      waterWeight: emptyWaterWeight(),
    }
  }

  const reliableCalories = logs
    .filter((log) => log.calories != null && !isLowOutlier(log, minCalories, today))
    .map((log) => log.calories as number)
  const reliableMedian = median(reliableCalories)

  let adjustedReadings = 0
  let maxOffset = 0
  let totalOffset = 0
  const absoluteThreshold = unit === 'kg' ? 0.4 : 1

  const points = raw.map((point, index) => {
    const nearby = raw
      .filter((other, otherIndex) => otherIndex !== index && Math.abs(other.x - point.x) <= 7)
      .map((other) => other.y)

    if (nearby.length < 2) return point

    const stable = median(nearby)
    if (stable == null || stable <= 0) return point

    const excess = point.y - stable
    const trackingNoise = hasRecentTrackingNoise({
      date: point.date,
      logs,
      maintenance,
      reliableMedian,
      minCalories,
      today,
    })
    const threshold = trackingNoise
      ? Math.max(absoluteThreshold, stable * 0.005)
      : Math.max(absoluteThreshold * 1.5, stable * 0.01)
    if (excess <= threshold) return point

    const offset = Math.min(excess, stable * 0.02)
    if (offset <= 0) return point

    adjustedReadings += 1
    maxOffset = Math.max(maxOffset, offset)
    totalOffset += offset
    return { ...point, y: point.y - offset }
  })

  return {
    points,
    waterWeight: { adjustedReadings, maxOffset, totalOffset },
  }
}

// Thresholds for a trustworthy calibration (~2 weeks of consistent data).
const MIN_WINDOW_DAYS = 14
const MIN_BODY_READINGS = 5
const MIN_DAYS_LOGGED = 10
// A suggestion fires only on a tangible and proportional gap.
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

  const inWindow = bodyEntries.filter((e) => {
    if (e.bodyweight == null) return false
    const d = parseISO(e.measured_on)
    return d >= windowStart && d <= todayD
  })
  const bodyReadings = inWindow.length
  const { points: pts, waterWeight } = applyWaterWeightGuard({
    entries: inWindow,
    unit,
    logs,
    maintenance,
    minCalories,
    today,
  })
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
      waterWeight,
      suggestion: null,
      aligned: false,
    }
  }

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
      waterWeight,
      suggestion: null,
      aligned: false,
    }
  }

  // gap > 0 means predicted loss is faster than scale loss, so the deficit is
  // overstated and maintenance is probably too high.
  const gap = predictedWeeklyLoss - actualWeeklyLoss
  const dailyOff = (gap * perUnit) / 7
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
    waterWeight,
    suggestion,
    aligned: suggestion == null,
  }
}
