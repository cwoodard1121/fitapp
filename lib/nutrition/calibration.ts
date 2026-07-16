/**
 * Maintenance calibration: compare the loss your calorie deficit predicts with
 * the loss your scale shows over the active diet block, or the tracked period
 * when no block is active.
 *
 * Cut phases use the lowest weigh-in in the calibration window so a single
 * heavier morning cannot erase the low-water mark. During the first three weeks,
 * faster-than-predicted loss is treated as possible water/glycogen movement and
 * never used to raise maintenance.
 *
 * The intake side requires the latest seven completed days to be consistently
 * logged. Missing or obviously under-logged days block suggestions.
 */
import { addDays, differenceInCalendarDays, parseISO } from 'date-fns'

import type { BlockPhase, BodyMetric, NutritionLog, Unit } from '@/lib/types'

import {
  DEFAULT_WEIGHT_KG,
  KCAL_PER_STEP,
  REF_WEIGHT_KG,
  kcalPerUnit,
} from './deficit'

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
  /** Active diet-block phase. */
  phase?: BlockPhase | null
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
  /** Starting cut loss ignored as early diet water, in the user's bodyweight unit. */
  earlyDietOffset: number
  /** Maximum early cut water-loss allowance, in the user's bodyweight unit. */
  earlyDietAllowance: number
}

export interface Calibration {
  status: 'ok' | 'insufficient' | 'no_maintenance'
  /** units/week, positive = losing. */
  predictedWeeklyLoss: number
  actualWeeklyLoss: number
  /** How the scale-side weekly rate was estimated. */
  scaleBasis: 'linear_trend' | 'cut_floor'
  windowDays: number
  bodyReadings: number
  daysLogged: number
  /** Days in the selected recent intake window. */
  intakeWindowDays: number
  /** Reliable logged intake days / window days. */
  trackingConsistency: number
  /** Completed low-calorie days dropped from calibration as likely under-logged. */
  ignoredLowDays: number
  waterWeight: WaterWeightAdjustment
  /** Non-null only when status==='ok' and the rates diverge meaningfully. */
  suggestion: CalibrationSuggestion | null
  /** A trustworthy comparison exists, but an early-cut upward change is withheld. */
  deferredReason: 'early_cut_water' | null
  /** True when status==='ok' and the rates line up (no suggestion). */
  aligned: boolean
}

interface TrendPoint {
  x: number
  y: number
  date: string
}

interface ScaleEstimate {
  /** units/week, positive = losing. */
  weeklyLoss: number
  /** Total scale change across the estimate span, positive = losing. */
  scaleLoss: number
  /** Days between the starting weigh-in and the current endpoint. */
  spanDays: number
  /** Starting bodyweight used for allowance caps. */
  firstWeight: number
  basis: Calibration['scaleBasis']
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

function emptyWaterWeight(): WaterWeightAdjustment {
  return {
    adjustedReadings: 0,
    maxOffset: 0,
    totalOffset: 0,
    earlyDietOffset: 0,
    earlyDietAllowance: 0,
  }
}

function isLowOutlier(log: NutritionLog, minCalories: number | null): boolean {
  return (
    minCalories != null &&
    log.calories != null &&
    log.calories < minCalories
  )
}

function trendPoints(entries: BodyMetric[]) {
  if (entries.length === 0) {
    return {
      points: [],
      waterWeight: emptyWaterWeight(),
    }
  }

  const baseMs = parseISO(entries[0].measured_on).getTime()
  return {
    points: entries.map((e) => ({
      x: (parseISO(e.measured_on).getTime() - baseMs) / 86_400_000,
      y: e.bodyweight as number,
      date: e.measured_on,
    })),
    waterWeight: emptyWaterWeight(),
  }
}

function cutFloorEstimate(points: TrendPoint[]): ScaleEstimate | null {
  if (points.length < 2) return null

  const first = points[0]
  const last = points[points.length - 1]
  const spanDays = last.x - first.x
  if (spanDays <= 0 || first.y <= 0) return null

  const floor = points.reduce((best, p) => (p.y < best.y ? p : best), points[0])
  const scaleLoss = first.y - floor.y

  return {
    weeklyLoss: (scaleLoss * 7) / spanDays,
    scaleLoss,
    spanDays,
    firstWeight: first.y,
    basis: 'cut_floor',
  }
}

function linearTrendEstimate(points: TrendPoint[]): ScaleEstimate | null {
  if (points.length < 2) return null

  const first = points[0]
  const last = points[points.length - 1]
  const spanDays = last.x - first.x
  if (spanDays <= 0 || first.y <= 0) return null

  const s = slope(points)
  if (s == null) return null

  const weeklyLoss = -s * 7
  return {
    weeklyLoss,
    scaleLoss: (weeklyLoss * spanDays) / 7,
    spanDays,
    firstWeight: first.y,
    basis: 'linear_trend',
  }
}

function estimateScaleLoss(points: TrendPoint[], phase: BlockPhase | null | undefined) {
  if (phase === 'cut') {
    return cutFloorEstimate(points) ?? linearTrendEstimate(points)
  }

  return linearTrendEstimate(points)
}

// A calibration unlocks after one complete, consistently logged week.
const MIN_WINDOW_DAYS = 7
const MIN_BODY_READINGS = 2
const MIN_DAYS_LOGGED = 7
const MIN_TRACKING_CONSISTENCY = 1
// A suggestion fires only on a tangible and proportional gap.
const MIN_DAILY_KCAL_GAP = 100
const MIN_PROPORTIONAL_GAP = 0.25
const MAX_SUGGESTION_KCAL = 500

interface IntakeWindow {
  start: Date
  end: Date
  days: number
  reliableDays: number
  ignoredLowDays: number
  consistency: number
  avgDailyDeficit: number
}

function maxDate(a: Date, b: Date) {
  return a > b ? a : b
}

function dateKey(d: Date) {
  return d.toISOString().slice(0, 10)
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function intakeWindow({
  logs,
  stepsByDate,
  maintenance,
  weightKg,
  stepBaseline,
  minCalories,
  start,
  end,
}: {
  logs: NutritionLog[]
  stepsByDate: Record<string, number>
  maintenance: number
  weightKg: number
  stepBaseline: number
  minCalories: number | null
  start: Date
  end: Date
}): IntakeWindow {
  const days = Math.max(0, differenceInCalendarDays(end, start) + 1)
  if (days === 0) {
    return { start, end, days: 0, reliableDays: 0, ignoredLowDays: 0, consistency: 0, avgDailyDeficit: 0 }
  }

  const logsByDate = new Map(logs.map((log) => [log.logged_on, log]))
  const deficits: number[] = []
  let ignoredLowDays = 0

  for (let i = 0; i < days; i++) {
    const d = addDays(start, i)
    const key = dateKey(d)
    const log = logsByDate.get(key)
    if (log?.calories == null) continue
    if (isLowOutlier(log, minCalories)) {
      ignoredLowDays += 1
      continue
    }

    const steps = stepsByDate[key]
    const adjustment =
      steps != null
        ? Math.max(0, stepBaseline - steps) * KCAL_PER_STEP * (weightKg / REF_WEIGHT_KG)
        : 0
    deficits.push(maintenance - adjustment - log.calories)
  }

  return {
    start,
    end,
    days,
    reliableDays: deficits.length,
    ignoredLowDays,
    consistency: deficits.length / days,
    avgDailyDeficit: mean(deficits),
  }
}

function selectIntakeWindow({
  logs,
  stepsByDate,
  maintenance,
  weightKg,
  stepBaseline,
  minCalories,
  blockStart,
  today,
}: {
  logs: NutritionLog[]
  stepsByDate: Record<string, number>
  maintenance: number
  weightKg: number
  stepBaseline: number
  minCalories: number | null
  blockStart: Date
  today: Date
}) {
  const end = addDays(today, -1)
  if (end < blockStart) {
    return intakeWindow({
      logs,
      stepsByDate,
      maintenance,
      weightKg,
      stepBaseline,
      minCalories,
      start: blockStart,
      end: blockStart,
    })
  }

  return intakeWindow({
    logs,
    stepsByDate,
    maintenance,
    weightKg,
    stepBaseline,
    minCalories,
    start: maxDate(blockStart, addDays(end, -(MIN_WINDOW_DAYS - 1))),
    end,
  })
}

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
    phase,
  } = input

  const perUnit = kcalPerUnit(unit)
  const todayD = parseISO(today)
  const calibrationStart = windowStart
  const windowDays = Math.max(0, differenceInCalendarDays(todayD, calibrationStart))

  const inWindow = bodyEntries.filter((e) => {
    if (e.bodyweight == null) return false
    const d = parseISO(e.measured_on)
    return d >= calibrationStart && d <= todayD
  })
  const bodyReadings = inWindow.length
  const { points: pts, waterWeight } = trendPoints(inWindow)
  const scaleEstimate = estimateScaleLoss(pts, phase)
  const scaleBasis = scaleEstimate?.basis ?? (phase === 'cut' ? 'cut_floor' : 'linear_trend')
  const actualWeeklyLoss = scaleEstimate?.weeklyLoss ?? 0

  if (maintenance == null) {
    return {
      status: 'no_maintenance',
      predictedWeeklyLoss: 0,
      actualWeeklyLoss,
      scaleBasis,
      windowDays,
      bodyReadings,
      daysLogged: 0,
      intakeWindowDays: 0,
      trackingConsistency: 0,
      ignoredLowDays: 0,
      waterWeight,
      suggestion: null,
      deferredReason: null,
      aligned: false,
    }
  }

  const wk = weightKg > 0 ? weightKg : DEFAULT_WEIGHT_KG
  const intake = selectIntakeWindow({
    logs,
    stepsByDate,
    maintenance,
    weightKg: wk,
    stepBaseline,
    minCalories,
    blockStart: calibrationStart,
    today: todayD,
  })
  const predictedWeeklyLoss = (intake.avgDailyDeficit * 7) / perUnit

  const enough =
    windowDays >= MIN_WINDOW_DAYS &&
    bodyReadings >= MIN_BODY_READINGS &&
    intake.days >= MIN_WINDOW_DAYS &&
    intake.reliableDays >= MIN_DAYS_LOGGED &&
    intake.consistency >= MIN_TRACKING_CONSISTENCY &&
    scaleEstimate != null
  if (!enough) {
    return {
      status: 'insufficient',
      predictedWeeklyLoss,
      actualWeeklyLoss,
      scaleBasis,
      windowDays,
      bodyReadings,
      daysLogged: intake.reliableDays,
      intakeWindowDays: intake.days,
      trackingConsistency: intake.consistency,
      ignoredLowDays: intake.ignoredLowDays,
      waterWeight,
      suggestion: null,
      deferredReason: null,
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
  let deferredReason: Calibration['deferredReason'] = null
  if (meaningful) {
    const kcal = Math.min(MAX_SUGGESTION_KCAL, Math.round(Math.abs(dailyOff) / 50) * 50)
    if (kcal >= 50) {
      const direction: 'lower' | 'raise' = dailyOff > 0 ? 'lower' : 'raise'
      const newMaintenance = direction === 'lower' ? maintenance - kcal : maintenance + kcal
      const earlyCut = phase === 'cut' && differenceInCalendarDays(todayD, windowStart) < 21
      if (!(earlyCut && direction === 'raise')) {
        suggestion = { direction, kcal, newMaintenance }
      } else {
        deferredReason = 'early_cut_water'
      }
    }
  }

  return {
    status: 'ok',
    predictedWeeklyLoss,
    actualWeeklyLoss,
    scaleBasis,
    windowDays,
    bodyReadings,
    daysLogged: intake.reliableDays,
    intakeWindowDays: intake.days,
    trackingConsistency: intake.consistency,
    ignoredLowDays: intake.ignoredLowDays,
    waterWeight,
    suggestion,
    deferredReason,
    aligned: suggestion == null && deferredReason == null,
  }
}
