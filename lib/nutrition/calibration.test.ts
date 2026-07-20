import { describe, expect, it } from 'vitest'

import type { BodyMetric, NutritionLog } from '@/lib/types'
import {
  CALIBRATION_MIN_DAYS,
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

function completeInput({
  maintenance = 2500,
  weightOutlier = false,
}: {
  maintenance?: number | null
  weightOutlier?: boolean
} = {}) {
  const analysisDates = dates('2026-06-15', CALIBRATION_MIN_DAYS)
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
      today: '2026-06-29',
    },
    trueMaintenance,
  }
}

describe('maintenance calibration', () => {
  it('keeps calibration locked during the first 14 block days', () => {
    const result = computeCalibration({
      bodyEntries: [],
      logs: [],
      stepsByDate: {},
      maintenance: 2500,
      stepBaseline: 10_000,
      weightKg: 70,
      unit: 'lb',
      windowStart: new Date(2026, 5, 1),
      today: '2026-06-10',
    })

    expect(result.status).toBe('collecting')
    expect(result.checklist.find((item) => item.key === 'water')?.complete).toBe(false)
  })

  it('infers maintenance at the fixed step baseline from complete tracking', () => {
    const { input, trueMaintenance } = completeInput()
    const result = computeCalibration(input)

    expect(result.status).toBe('ready')
    expect(result.actualWeeklyLoss).toBeCloseTo(1, 6)
    expect(result.estimatedMaintenance).toBe(trueMaintenance)
    expect(result.suggestion).toMatchObject({
      direction: 'raise',
      newMaintenance: trueMaintenance,
    })
  })

  it('normalizes alternating high and low step days without moving the baseline', () => {
    const { input } = completeInput()
    const result = computeCalibration(input)

    expect(result.avgSteps).toBe(10_000)
    expect(result.stepBaseline).toBe(10_000)
    expect(result.estimatedMaintenance).toBe(2600)
  })

  it('waits when even one calorie or step day is missing', () => {
    const { input } = completeInput()
    const missingDate = Object.keys(input.stepsByDate)[0]
    delete input.stepsByDate[missingDate]
    input.logs = input.logs.slice(1)

    const result = computeCalibration(input)

    expect(result.status).toBe('collecting')
    expect(result.checklist.find((item) => item.key === 'calories')?.complete).toBe(false)
    expect(result.checklist.find((item) => item.key === 'steps')?.complete).toBe(false)
    expect(result.estimatedMaintenance).toBeNull()
  })

  it('uses a robust scale slope that resists one water-weight spike', () => {
    const { input } = completeInput({ weightOutlier: true })
    const result = computeCalibration(input)

    expect(result.status).toBe('ready')
    expect(result.actualWeeklyLoss).toBeCloseTo(1, 6)
    expect(result.estimatedMaintenance).toBe(2600)
  })

  it('can establish maintenance when no prior setting exists', () => {
    const { input } = completeInput({ maintenance: null })
    const result = computeCalibration(input)

    expect(result.status).toBe('ready')
    expect(result.suggestion).toEqual({
      direction: 'set',
      kcal: null,
      newMaintenance: 2600,
    })
  })
})
