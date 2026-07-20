/**
 * Infer maintenance calories at one fixed step baseline.
 *
 * Food and step logs are treated as accurate observations. Once early block
 * water has settled and the scale trend is dense enough, the remaining error
 * is assigned to maintenance:
 *
 * baseline maintenance = intake + observed tissue change - step delta
 */
import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
} from 'date-fns'

import type { BodyMetric, NutritionLog, Unit } from '@/lib/types'
import {
  DEFAULT_WEIGHT_KG,
  KCAL_PER_STEP,
  REF_WEIGHT_KG,
  kcalPerUnit,
} from './deficit'

export const CALIBRATION_SETTLE_DAYS = 6
export const CALIBRATION_ESTIMATE_DAYS = 7
export const CALIBRATION_MAX_DAYS = 14
export const CALIBRATION_ESTIMATE_WEIGH_INS = 5
export const CALIBRATION_ESTIMATE_WEIGHT_SPAN_DAYS = 6
export const CALIBRATION_LOCK_WEIGH_INS = 10
export const CALIBRATION_LOCK_WEIGHT_SPAN_DAYS = 13

export interface CalibrationInput {
  /** body_metrics ascending by measured_on. */
  bodyEntries: BodyMetric[]
  logs: NutritionLog[]
  stepsByDate: Record<string, number>
  maintenance: number | null
  /** The step count at which maintenance is defined and kept fixed. */
  stepBaseline: number
  /** Latest bodyweight in kg, used only to scale the step-energy estimate. */
  weightKg: number
  unit: Unit
  /** Active diet-block start, or the earliest reliable tracking date. */
  windowStart: Date
  /** Today's yyyy-MM-dd; today is never used because it is incomplete. */
  today: string
}

export interface CalibrationChecklistItem {
  key: 'water' | 'tracking' | 'scale' | 'lock'
  label: string
  complete: boolean
  detail: string
}

export interface CalibrationSuggestion {
  direction: 'set' | 'lower' | 'raise'
  /** Absolute difference from the current setting; null when none exists. */
  kcal: number | null
  newMaintenance: number
}

export interface Calibration {
  status: 'collecting' | 'provisional' | 'ready'
  checklist: CalibrationChecklistItem[]
  stepBaseline: number
  analysisStart: string | null
  analysisEnd: string | null
  analysisDays: number
  caloriesLogged: number
  stepsLogged: number
  bodyReadings: number
  bodySpanDays: number
  /** User units/week; positive means losing, negative means gaining. */
  actualWeeklyLoss: number | null
  scaleBasis: 'theil_sen'
  avgCalories: number | null
  avgSteps: number | null
  /** Maintenance normalized to exactly stepBaseline, rounded to 25 kcal. */
  estimatedMaintenance: number | null
  difference: number | null
  suggestion: CalibrationSuggestion | null
  aligned: boolean
}

interface WeightPoint {
  day: number
  weight: number
  date: string
}

function dateKey(date: Date) {
  return format(date, 'yyyy-MM-dd')
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

/** Robust slope: the median of every pairwise daily slope. */
function theilSenSlope(points: WeightPoint[]): number | null {
  const slopes: number[] = []
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const span = points[j].day - points[i].day
      if (span > 0) slopes.push((points[j].weight - points[i].weight) / span)
    }
  }
  return median(slopes)
}

function roundTo25(value: number) {
  return Math.round(value / 25) * 25
}

function calendarDates(start: Date, end: Date): string[] {
  const days = Math.max(0, differenceInCalendarDays(end, start) + 1)
  return Array.from({ length: days }, (_, index) => dateKey(addDays(start, index)))
}

export function computeCalibration(input: CalibrationInput): Calibration {
  const {
    bodyEntries,
    logs,
    stepsByDate,
    maintenance,
    stepBaseline,
    weightKg,
    unit,
    windowStart,
    today,
  } = input
  const todayDate = parseISO(today)
  const completedEnd = addDays(todayDate, -1)
  const settledStart = addDays(windowStart, CALIBRATION_SETTLE_DAYS)
  const settlingDays = Math.max(
    0,
    Math.min(
      CALIBRATION_SETTLE_DAYS,
      differenceInCalendarDays(todayDate, windowStart),
    ),
  )
  const waterComplete = todayDate >= settledStart
  const availableDays = waterComplete
    ? differenceInCalendarDays(completedEnd, settledStart) + 1
    : 0
  const analysisDays = Math.max(
    0,
    Math.min(CALIBRATION_MAX_DAYS, availableDays),
  )
  const analysisEnd = analysisDays > 0 ? completedEnd : null
  const analysisStart =
    analysisEnd != null ? addDays(analysisEnd, -(analysisDays - 1)) : null
  const dates =
    analysisStart && analysisEnd ? calendarDates(analysisStart, analysisEnd) : []

  const logsByDate = new Map(logs.map((log) => [log.logged_on, log]))
  const calories = dates.flatMap((date) => {
    const value = logsByDate.get(date)?.calories
    return value == null ? [] : [Number(value)]
  })
  const steps = dates.flatMap((date) => {
    const value = stepsByDate[date]
    return value == null ? [] : [Number(value)]
  })

  const weightPoints: WeightPoint[] = analysisStart && analysisEnd
    ? bodyEntries
        .filter((entry) => {
          if (entry.bodyweight == null || entry.bodyweight <= 0) return false
          const measured = parseISO(entry.measured_on)
          return measured >= analysisStart && measured <= analysisEnd
        })
        .map((entry) => ({
          day: differenceInCalendarDays(
            parseISO(entry.measured_on),
            analysisStart,
          ),
          weight: Number(entry.bodyweight),
          date: entry.measured_on,
        }))
    : []
  const bodySpanDays =
    weightPoints.length >= 2
      ? differenceInCalendarDays(
          parseISO(weightPoints[weightPoints.length - 1].date),
          parseISO(weightPoints[0].date),
        )
      : 0
  const scaleSlope = theilSenSlope(weightPoints)
  const actualWeeklyLoss = scaleSlope == null ? null : -scaleSlope * 7

  const trackingComplete =
    analysisDays >= CALIBRATION_ESTIMATE_DAYS &&
    calories.length === analysisDays &&
    steps.length === analysisDays
  const scaleEstimateComplete =
    weightPoints.length >= CALIBRATION_ESTIMATE_WEIGH_INS &&
    bodySpanDays >= CALIBRATION_ESTIMATE_WEIGHT_SPAN_DAYS &&
    scaleSlope != null
  const lockComplete =
    analysisDays >= CALIBRATION_MAX_DAYS &&
    calories.length === CALIBRATION_MAX_DAYS &&
    steps.length === CALIBRATION_MAX_DAYS &&
    weightPoints.length >= CALIBRATION_LOCK_WEIGH_INS &&
    bodySpanDays >= CALIBRATION_LOCK_WEIGHT_SPAN_DAYS &&
    scaleSlope != null
  const canEstimate = waterComplete && trackingComplete && scaleEstimateComplete

  const checklist: CalibrationChecklistItem[] = [
    {
      key: 'water',
      label: 'Water settling',
      complete: waterComplete,
      detail: waterComplete
        ? 'First 6 block days excluded'
        : `${settlingDays}/${CALIBRATION_SETTLE_DAYS} days`,
    },
    {
      key: 'tracking',
      label: 'First estimate',
      complete: trackingComplete,
      detail: `${Math.min(
        CALIBRATION_ESTIMATE_DAYS,
        calories.length,
        steps.length,
      )}/${CALIBRATION_ESTIMATE_DAYS} complete calorie + step days`,
    },
    {
      key: 'scale',
      label: 'Usable scale rate',
      complete: scaleEstimateComplete,
      detail: `${Math.min(
        CALIBRATION_ESTIMATE_WEIGH_INS,
        weightPoints.length,
      )}/${CALIBRATION_ESTIMATE_WEIGH_INS} weigh-ins · ${Math.min(
        CALIBRATION_ESTIMATE_WEIGHT_SPAN_DAYS,
        bodySpanDays,
      )}/${CALIBRATION_ESTIMATE_WEIGHT_SPAN_DAYS} days`,
    },
    {
      key: 'lock',
      label: 'Estimate locked',
      complete: lockComplete,
      detail: `${Math.min(
        calories.length,
        steps.length,
      )}/${CALIBRATION_MAX_DAYS} complete days · ${weightPoints.length}/${CALIBRATION_LOCK_WEIGH_INS} weigh-ins · ${bodySpanDays}/${CALIBRATION_LOCK_WEIGHT_SPAN_DAYS} days`,
    },
  ]
  const ready = canEstimate && lockComplete

  let estimatedMaintenance: number | null = null
  const avgCalories: number | null = mean(calories)
  const avgSteps: number | null = mean(steps)
  if (canEstimate && actualWeeklyLoss != null) {
    const kg = weightKg > 0 ? weightKg : DEFAULT_WEIGHT_KG
    const tissueKcalPerDay = (actualWeeklyLoss * kcalPerUnit(unit)) / 7
    const baselineEstimates = dates.map((date) => {
      const intake = Number(logsByDate.get(date)!.calories)
      const stepDelta =
        (stepsByDate[date] - stepBaseline) *
        KCAL_PER_STEP *
        (kg / REF_WEIGHT_KG)
      return intake + tissueKcalPerDay - stepDelta
    })
    estimatedMaintenance = roundTo25(mean(baselineEstimates)!)
  }

  const difference =
    estimatedMaintenance == null || maintenance == null
      ? null
      : estimatedMaintenance - maintenance
  const aligned = ready && difference != null && Math.abs(difference) < 50
  const suggestion =
    !ready || estimatedMaintenance == null || aligned
      ? null
      : {
          direction:
            maintenance == null
              ? ('set' as const)
              : difference! < 0
                ? ('lower' as const)
                : ('raise' as const),
          kcal: maintenance == null ? null : Math.abs(difference!),
          newMaintenance: estimatedMaintenance,
        }

  return {
    status: ready ? 'ready' : canEstimate ? 'provisional' : 'collecting',
    checklist,
    stepBaseline,
    analysisStart: analysisStart ? dateKey(analysisStart) : null,
    analysisEnd: analysisEnd ? dateKey(analysisEnd) : null,
    analysisDays,
    caloriesLogged: calories.length,
    stepsLogged: steps.length,
    bodyReadings: weightPoints.length,
    bodySpanDays,
    actualWeeklyLoss,
    scaleBasis: 'theil_sen',
    avgCalories,
    avgSteps,
    estimatedMaintenance,
    difference,
    suggestion,
    aligned,
  }
}
