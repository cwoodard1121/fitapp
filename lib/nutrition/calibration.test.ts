import { describe, expect, it } from 'vitest'

import type { BodyMetric, NutritionLog } from '@/lib/types'

import { computeCalibration } from './calibration'

function bodyMetric(date: string, bodyweight: number): BodyMetric {
  return {
    id: `body-${date}`,
    user_id: 'user-1',
    measured_on: date,
    bodyweight,
    bodyfat_pct: null,
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

describe('maintenance calibration', () => {
  it('smooths a refeed-linked bodyweight spike with a 2% cap', () => {
    const calibration = computeCalibration({
      bodyEntries: [
        bodyMetric('2026-06-20', 200),
        bodyMetric('2026-06-21', 200.2),
        bodyMetric('2026-06-22', 205),
        bodyMetric('2026-06-23', 199.8),
        bodyMetric('2026-06-24', 199.6),
      ],
      logs: [
        nutritionLog('2026-06-20', 2000),
        nutritionLog('2026-06-21', 3100),
        nutritionLog('2026-06-22', 2100),
        nutritionLog('2026-06-23', 2000),
        nutritionLog('2026-06-24', 2050),
      ],
      stepsByDate: {},
      maintenance: 2500,
      stepBaseline: 10000,
      weightKg: 90,
      minCalories: 1200,
      unit: 'lb',
      windowStart: new Date('2026-06-20T00:00:00.000Z'),
      today: '2026-06-24',
    })

    expect(calibration.waterWeight.adjustedReadings).toBe(1)
    expect(calibration.waterWeight.maxOffset).toBeGreaterThan(3.9)
    expect(calibration.waterWeight.maxOffset).toBeLessThan(4.1)
  })

  it('drops under-logged calorie days from predicted deficit', () => {
    const bodyEntries = [
      bodyMetric('2026-06-20', 200),
      bodyMetric('2026-06-23', 199.5),
      bodyMetric('2026-06-27', 199),
      bodyMetric('2026-07-02', 198.4),
      bodyMetric('2026-07-06', 198),
    ]
    const logs = [
      nutritionLog('2026-06-20', 2000),
      nutritionLog('2026-06-21', 2000),
      nutritionLog('2026-06-22', 2000),
      nutritionLog('2026-06-23', 500),
      nutritionLog('2026-06-24', 2000),
      nutritionLog('2026-06-25', 2000),
      nutritionLog('2026-06-26', 2000),
      nutritionLog('2026-06-27', 2000),
      nutritionLog('2026-06-28', 2000),
      nutritionLog('2026-06-29', 2000),
    ]

    const base = {
      bodyEntries,
      logs,
      stepsByDate: {},
      maintenance: 2500,
      stepBaseline: 10000,
      weightKg: 90,
      unit: 'lb' as const,
      windowStart: new Date('2026-06-20T00:00:00.000Z'),
      today: '2026-07-06',
    }

    const unfiltered = computeCalibration({ ...base, minCalories: null })
    const filtered = computeCalibration({ ...base, minCalories: 1200 })

    expect(unfiltered.daysLogged).toBe(10)
    expect(filtered.daysLogged).toBe(9)
    expect(unfiltered.predictedWeeklyLoss).toBeGreaterThan(filtered.predictedWeeklyLoss + 0.25)
  })
})
