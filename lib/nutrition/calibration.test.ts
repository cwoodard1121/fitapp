import { describe, expect, it } from 'vitest'

import type { BodyMetric, NutritionLog } from '@/lib/types'
import {
  CALIBRATION_ESTIMATE_DAYS,
  CALIBRATION_LOOKBACK_DAYS,
  CALIBRATION_RELIABLE_DAYS,
  computeCalibration,
} from './calibration'
import { KCAL_PER_STEP } from './deficit'

function dates(start: string, count: number): string[] {
  const first = new Date(`${start}T00:00:00.000Z`)
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(first)
    date.setUTCDate(date.getUTCDate() + index)
    return date.toISOString().slice(0, 10)
  })
}

function bodyMetric(date: string, bodyweight: number): BodyMetric {
  return {
    id: `body-${date}`,
    user_id: 'user-1',
    measured_on: date,
    bodyweight,
    bodyfat_pct: null,
    bia_bodyfat_pct: null,
    height_cm: null,
    neck_cm: null,
    waist_cm: null,
    navy_bodyfat_pct: null,
    notes: null,
    source: 'manual',
    created_at: `${date}T00:00:00.000Z`,
  }
}

function nutritionLog(date: string, calories: number): NutritionLog {
  return {
    id: `nutrition-${date}`,
    user_id: 'user-1',
    logged_on: date,
    calories,
    protein: null,
    carbs: null,
    fat: null,
    notes: null,
    source: 'manual',
    created_at: `${date}T00:00:00.000Z`,
  }
}

function trackedInput({
  days = CALIBRATION_RELIABLE_DAYS,
  maintenance = 2500,
  weightOutlier = false,
}: {
  days?: number
  maintenance?: number | null
  weightOutlier?: boolean
} = {}) {
  const analysisDates = dates('2026-06-07', days)
  const trueMaintenance = 2600
  const weeklyLoss = 1
  const stepsByDate = Object.fromEntries(
    analysisDates.map((date, index) => [date, index % 2 ? 12_000 : 8_000]),
  )
  const logs = analysisDates.map((date) => {
    const stepDelta = (stepsByDate[date] - 10_000) * KCAL_PER_STEP
    return nutritionLog(date, trueMaintenance + stepDelta - 500)
  })
  const bodyEntries = analysisDates.map((date, index) =>
    bodyMetric(
      date,
      200 - (weeklyLoss * index) / 7 + (weightOutlier && index === 6 ? 5 : 0),
    ),
  )

  return {
    input: {
      bodyEntries,
      logs,
      stepsByDate,
      maintenance,
      stepBaseline: 10_000,
      weightKg: 70,
      unit: 'lb' as const,
      windowStart: new Date(2026, 5, 1),
      today: dates('2026-06-07', days + 1)[days],
    },
    trueMaintenance,
  }
}

describe('maintenance calibration', () => {
  it('uses a six-day water-settling period', () => {
    const result = computeCalibration({
      bodyEntries: [],
      logs: [],
      stepsByDate: {},
      maintenance: 2500,
      stepBaseline: 10_000,
      weightKg: 70,
      unit: 'lb',
      windowStart: new Date(2026, 5, 1),
      today: '2026-06-06',
    })

    expect(result.status).toBe('collecting')
    expect(result.checklist.find((item) => item.key === 'water')).toMatchObject({
      complete: false,
      detail: '5/6 days',
    })
  })

  it('shows a provisional estimate after seven complete post-settling days', () => {
    const { input, trueMaintenance } = trackedInput({
      days: CALIBRATION_ESTIMATE_DAYS,
    })
    const result = computeCalibration(input)

    expect(result.status).toBe('provisional')
    expect(result.analysisDays).toBe(7)
    expect(result.actualWeeklyLoss).toBeCloseTo(1, 6)
    expect(result.estimatedMaintenance).toBe(trueMaintenance)
    expect(result.suggestion).toBeNull()
  })

  it('marks the estimate reliable at fourteen complete post-settling days', () => {
    const { input, trueMaintenance } = trackedInput()
    const result = computeCalibration(input)

    expect(result.status).toBe('ready')
    expect(result.analysisDays).toBe(14)
    expect(result.estimatedMaintenance).toBe(trueMaintenance)
    expect(result.suggestion).toMatchObject({
      direction: 'raise',
      newMaintenance: trueMaintenance,
    })
  })

  it('waits when the first seven-day calorie or step window is incomplete', () => {
    const { input } = trackedInput({ days: CALIBRATION_ESTIMATE_DAYS })
    const missingDate = Object.keys(input.stepsByDate)[0]
    delete input.stepsByDate[missingDate]
    input.logs = input.logs.slice(1)

    const result = computeCalibration(input)

    expect(result.status).toBe('collecting')
    expect(result.checklist.find((item) => item.key === 'tracking')?.complete).toBe(false)
    expect(result.estimatedMaintenance).toBeNull()
  })

  it('normalizes high and low step days around the fixed baseline', () => {
    const { input } = trackedInput({ days: CALIBRATION_ESTIMATE_DAYS })
    const result = computeCalibration(input)

    expect(result.avgSteps).toBeCloseTo(9714.29, 2)
    expect(result.stepBaseline).toBe(10_000)
    expect(result.estimatedMaintenance).toBe(2600)
  })

  it('reports average intake as a whole calorie without changing the estimate math', () => {
    const { input } = trackedInput({ days: CALIBRATION_ESTIMATE_DAYS })
    const result = computeCalibration(input)

    expect(result.avgCalories).toBe(2089)
    expect(Number.isInteger(result.avgCalories)).toBe(true)
    expect(result.estimatedMaintenance).toBe(2600)
  })

  it('uses a robust scale slope that resists one water-weight spike', () => {
    const { input } = trackedInput({ weightOutlier: true })
    const result = computeCalibration(input)

    expect(result.status).toBe('ready')
    expect(result.actualWeeklyLoss).toBeCloseTo(1, 6)
    expect(result.estimatedMaintenance).toBe(2600)
  })

  it('resists several acute water spikes late in a longer block', () => {
    const { input } = trackedInput({ days: 28 })
    for (const index of [24, 25, 26]) {
      input.bodyEntries[index].bodyweight =
        (input.bodyEntries[index].bodyweight ?? 0) + 5
    }

    const result = computeCalibration(input)

    expect(result.status).toBe('ready')
    expect(result.actualWeeklyLoss).toBeCloseTo(1, 6)
    expect(result.estimatedMaintenance).toBe(2600)
  })

  it('excludes the old calorie regime and settling water after a reset', () => {
    const trueMaintenance = 2600
    const stepBaseline = 10_000
    const oldDates = dates('2026-05-04', 28)
    const resetDates = dates('2026-06-01', 20)
    const oldLogs = oldDates.map((date) => nutritionLog(date, 2050))
    const oldWeights = oldDates.map((date, index) =>
      bodyMetric(date, 210 - (550 / 3500) * index),
    )
    const newLogs = resetDates.map((date) => nutritionLog(date, 2400))
    const newWeights = resetDates.map((date, index) => {
      const tissueWeight = 195 - (200 / 3500) * index
      // The calorie increase adds 3 lb across the reset's six settling days,
      // then holds that water level while the new tissue trend continues.
      const waterWeight = Math.min(3, (index + 1) * 0.5)
      return bodyMetric(date, tissueWeight + waterWeight)
    })
    const stepsByDate = Object.fromEntries(
      [...oldDates, ...resetDates].map((date) => [date, stepBaseline]),
    )
    const common = {
      logs: newLogs,
      bodyEntries: newWeights,
      stepsByDate,
      maintenance: 2500,
      stepBaseline,
      weightKg: 70,
      unit: 'lb' as const,
      windowStart: new Date(2026, 5, 1),
      today: '2026-06-21',
    }

    const resetOnly = computeCalibration(common)
    const withOldRegime = computeCalibration({
      ...common,
      logs: [...oldLogs, ...newLogs],
      bodyEntries: [...oldWeights, ...newWeights],
    })

    expect(withOldRegime).toMatchObject({
      status: 'ready',
      calibrationStart: '2026-06-01',
      analysisStart: '2026-06-07',
      analysisEnd: '2026-06-20',
      analysisDays: 14,
      caloriesLogged: 14,
      bodyReadings: 14,
      avgCalories: 2400,
      estimatedMaintenance: trueMaintenance,
    })
    expect(withOldRegime.actualWeeklyLoss).toBeCloseTo(0.4, 6)
    expect(withOldRegime.estimatedMaintenance).toBe(resetOnly.estimatedMaintenance)
    expect(withOldRegime.actualWeeklyLoss).toBeCloseTo(
      resetOnly.actualWeeklyLoss!,
      10,
    )
  })

  it('returns to collecting immediately when a ready calibration is reset', () => {
    const { input } = trackedInput()
    const ready = computeCalibration(input)
    const reset = computeCalibration({
      ...input,
      windowStart: new Date(2026, 5, 21),
    })

    expect(ready.status).toBe('ready')
    expect(reset).toMatchObject({
      status: 'collecting',
      calibrationStart: '2026-06-21',
      analysisStart: null,
      analysisEnd: null,
      analysisDays: 0,
      caloriesLogged: 0,
      stepsLogged: 0,
      bodyReadings: 0,
      estimatedMaintenance: null,
      suggestion: null,
    })
    expect(reset.checklist.find((item) => item.key === 'water')?.complete).toBe(false)
  })

  it('ignores low paired days and reports diagnostics from paired eligible dates', () => {
    const analysisDates = dates('2026-06-07', 10)
    const eligibleCalories = [2400, 2500, 2600, 2700, 2800, 2900, 3000]
    const eligibleSteps = [8000, 9000, 10_000, 11_000, 12_000, 13_000, 14_000]
    const logs = [
      nutritionLog(analysisDates[0], 900),
      nutritionLog(analysisDates[1], 2600),
      ...analysisDates.slice(3).map((date, index) =>
        nutritionLog(date, eligibleCalories[index]),
      ),
    ]
    const stepsByDate = {
      [analysisDates[0]]: 10_000,
      [analysisDates[2]]: 12_000,
      ...Object.fromEntries(
        analysisDates.slice(3).map((date, index) => [date, eligibleSteps[index]]),
      ),
    }
    const result = computeCalibration({
      bodyEntries: analysisDates.map((date, index) =>
        bodyMetric(date, 200 - index / 7),
      ),
      logs,
      stepsByDate,
      maintenance: 2500,
      stepBaseline: 10_000,
      weightKg: 70,
      unit: 'lb',
      windowStart: new Date(2026, 5, 1),
      minimumCalories: 1200,
      today: '2026-06-17',
    })

    expect(result).toMatchObject({
      status: 'provisional',
      analysisDays: 10,
      caloriesLogged: 7,
      stepsLogged: 7,
      ignoredLowDays: 1,
      avgCalories: 2700,
      avgSteps: 11_000,
    })
    expect(result.checklist.find((item) => item.key === 'tracking')?.detail).toContain(
      '1 low ignored',
    )
  })

  it('keeps adapting after day fourteen while the lookback window is not full', () => {
    const { input } = trackedInput({ days: 20 })
    for (const log of input.logs.slice(14)) {
      log.calories = (log.calories ?? 0) + 150
    }
    const result = computeCalibration(input)

    expect(result.status).toBe('ready')
    expect(result.analysisDays).toBe(20)
    expect(result.analysisStart).toBe('2026-06-07')
    expect(result.analysisEnd).toBe('2026-06-26')
    expect(result.estimatedMaintenance).toBe(2650)
  })

  it('uses only the latest six weeks once the lookback window is full', () => {
    const extraDays = 8
    const { input, trueMaintenance } = trackedInput({
      days: CALIBRATION_LOOKBACK_DAYS + extraDays,
    })
    const analysisDates = input.logs.map((log) => log.logged_on)
    for (let index = 0; index < extraDays; index++) {
      input.logs[index].calories = 8000
      input.bodyEntries[index].bodyweight =
        (input.bodyEntries[index].bodyweight ?? 0) + 100
    }

    const result = computeCalibration(input)

    expect(result).toMatchObject({
      status: 'ready',
      lookbackDays: CALIBRATION_LOOKBACK_DAYS,
      analysisDays: CALIBRATION_LOOKBACK_DAYS,
      analysisStart: analysisDates[extraDays],
      analysisEnd: analysisDates.at(-1),
      caloriesLogged: CALIBRATION_LOOKBACK_DAYS,
      stepsLogged: CALIBRATION_LOOKBACK_DAYS,
      bodyReadings: CALIBRATION_LOOKBACK_DAYS,
      estimatedMaintenance: trueMaintenance,
    })
    expect(result.actualWeeklyLoss).toBeCloseTo(1, 6)
  })

  it('keeps updating after a missed tracking day instead of resetting calibration', () => {
    const { input } = trackedInput({ days: 20 })
    delete input.stepsByDate[Object.keys(input.stepsByDate)[10]]

    const result = computeCalibration(input)

    expect(result.status).toBe('ready')
    expect(result.analysisDays).toBe(20)
    expect(result.stepsLogged).toBe(19)
    expect(result.estimatedMaintenance).toBe(2600)
  })

  it('can establish maintenance once the estimate is reliable', () => {
    const { input } = trackedInput({ maintenance: null })
    const result = computeCalibration(input)

    expect(result.status).toBe('ready')
    expect(result.suggestion).toEqual({
      direction: 'set',
      kcal: null,
      newMaintenance: 2600,
    })
  })
})
