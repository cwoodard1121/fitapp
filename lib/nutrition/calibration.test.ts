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
  it('does not suggest a maintenance change during the initial cut water flush', () => {
    const dates = [
      '2026-06-20',
      '2026-06-21',
      '2026-06-22',
      '2026-06-23',
      '2026-06-24',
      '2026-06-25',
      '2026-06-26',
      '2026-06-27',
      '2026-06-28',
      '2026-06-29',
      '2026-06-30',
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
      '2026-07-04',
    ]

    const calibration = computeCalibration({
      bodyEntries: [
        bodyMetric('2026-06-20', 200),
        bodyMetric('2026-06-23', 198.7),
        bodyMetric('2026-06-27', 197),
        bodyMetric('2026-07-01', 195.3),
        bodyMetric('2026-07-04', 194),
      ],
      logs: dates.map((date) => nutritionLog(date, 2000)),
      stepsByDate: {},
      maintenance: 2500,
      stepBaseline: 10000,
      weightKg: 90,
      minCalories: 1200,
      unit: 'lb',
      windowStart: new Date('2026-06-20T00:00:00.000Z'),
      today: '2026-07-04',
      phase: 'cut',
    })

    expect(calibration.status).toBe('insufficient')
    expect(calibration.waterWeight.earlyDietOffset).toBe(0)
    expect(calibration.suggestion).toBeNull()
  })

  it('waits for consistent post-flush intake instead of assuming perfect tracking', () => {
    const calibration = computeCalibration({
      bodyEntries: [
        bodyMetric('2026-06-27', 200),
        bodyMetric('2026-07-01', 199.4),
        bodyMetric('2026-07-05', 198.8),
        bodyMetric('2026-07-09', 198.2),
        bodyMetric('2026-07-13', 198),
      ],
      logs: [
        nutritionLog('2026-06-27', 2000),
        nutritionLog('2026-06-29', 2000),
        nutritionLog('2026-07-01', 2000),
        nutritionLog('2026-07-03', 2000),
        nutritionLog('2026-07-05', 2000),
        nutritionLog('2026-07-07', 2000),
        nutritionLog('2026-07-09', 2000),
        nutritionLog('2026-07-11', 2000),
      ],
      stepsByDate: {},
      maintenance: 2500,
      stepBaseline: 10000,
      weightKg: 90,
      minCalories: 1200,
      unit: 'lb',
      windowStart: new Date('2026-06-20T00:00:00.000Z'),
      today: '2026-07-14',
      phase: 'cut',
    })

    expect(calibration.status).toBe('insufficient')
    expect(calibration.daysLogged).toBe(8)
    expect(calibration.trackingConsistency).toBeLessThan(0.7)
    expect(calibration.suggestion).toBeNull()
  })

  it('drops under-logged calorie days from predicted deficit', () => {
    const dates = Array.from({ length: 17 }, (_, i) => {
      const d = new Date('2026-06-20T00:00:00.000Z')
      d.setUTCDate(d.getUTCDate() + i)
      return d.toISOString().slice(0, 10)
    })
    const bodyEntries = [
      bodyMetric('2026-06-20', 200),
      bodyMetric('2026-06-23', 199.5),
      bodyMetric('2026-06-27', 199),
      bodyMetric('2026-07-02', 198.4),
      bodyMetric('2026-07-06', 198),
    ]
    const logs = dates.map((date) => nutritionLog(date, date === '2026-06-23' ? 500 : 2000))

    const base = {
      bodyEntries,
      logs,
      stepsByDate: {},
      maintenance: 2500,
      stepBaseline: 10000,
      weightKg: 90,
      unit: 'lb' as const,
      windowStart: new Date('2026-06-20T00:00:00.000Z'),
      today: '2026-07-07',
    }

    const unfiltered = computeCalibration({ ...base, minCalories: null })
    const filtered = computeCalibration({ ...base, minCalories: 1200 })

    expect(unfiltered.daysLogged).toBe(17)
    expect(filtered.daysLogged).toBe(16)
    expect(filtered.ignoredLowDays).toBe(1)
  })

  it('trims a single bad intake day out of the maintenance average', () => {
    const dates = Array.from({ length: 22 }, (_, i) => {
      const d = new Date('2026-06-27T00:00:00.000Z')
      d.setUTCDate(d.getUTCDate() + i)
      return d.toISOString().slice(0, 10)
    })

    const calibration = computeCalibration({
      bodyEntries: [
        bodyMetric('2026-06-27', 200),
        bodyMetric('2026-07-01', 199.4),
        bodyMetric('2026-07-05', 198.8),
        bodyMetric('2026-07-09', 198.2),
        bodyMetric('2026-07-13', 197.1),
      ],
      logs: dates.map((date) => nutritionLog(date, date === '2026-07-05' ? 3500 : 2000)),
      stepsByDate: {},
      maintenance: 2500,
      stepBaseline: 10000,
      weightKg: 90,
      minCalories: 1200,
      unit: 'lb',
      windowStart: new Date('2026-06-20T00:00:00.000Z'),
      today: '2026-07-19',
      phase: 'cut',
    })

    expect(calibration.status).toBe('ok')
    expect(calibration.predictedWeeklyLoss).toBeGreaterThan(0.95)
    expect(calibration.predictedWeeklyLoss).toBeLessThan(1.05)
  })

  it('uses the cut block floor so one heavier morning does not lower maintenance', () => {
    const dates = [
      '2026-06-20',
      '2026-06-21',
      '2026-06-22',
      '2026-06-23',
      '2026-06-24',
      '2026-06-25',
      '2026-06-26',
      '2026-06-27',
      '2026-06-28',
      '2026-06-29',
      '2026-06-30',
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
      '2026-07-04',
      '2026-07-05',
    ]

    const calibration = computeCalibration({
      bodyEntries: [
        bodyMetric('2026-06-27', 200),
        bodyMetric('2026-06-30', 199.4),
        bodyMetric('2026-07-03', 198.8),
        bodyMetric('2026-07-06', 198),
        bodyMetric('2026-07-13', 199.7),
      ],
      logs: [
        ...dates,
        '2026-07-06',
        '2026-07-07',
        '2026-07-08',
        '2026-07-09',
        '2026-07-10',
        '2026-07-11',
        '2026-07-12',
      ].map((date) => nutritionLog(date, 2000)),
      stepsByDate: {},
      maintenance: 2500,
      stepBaseline: 10000,
      weightKg: 90,
      minCalories: 1200,
      unit: 'lb',
      windowStart: new Date('2026-06-20T00:00:00.000Z'),
      today: '2026-07-13',
      phase: 'cut',
    })

    expect(calibration.status).toBe('ok')
    expect(calibration.scaleBasis).toBe('cut_floor')
    expect(calibration.waterWeight.adjustedReadings).toBe(0)
    expect(calibration.predictedWeeklyLoss).toBeGreaterThan(0.95)
    expect(calibration.predictedWeeklyLoss).toBeLessThan(1.05)
    expect(calibration.actualWeeklyLoss).toBeGreaterThan(0.85)
    expect(calibration.actualWeeklyLoss).toBeLessThan(0.9)
    expect(calibration.suggestion).toBeNull()
  })

  it('lets an old cut block floor age down when no new lows happen', () => {
    const dates = Array.from({ length: 29 }, (_, i) => {
      const d = new Date('2026-06-27T00:00:00.000Z')
      d.setUTCDate(d.getUTCDate() + i)
      return d.toISOString().slice(0, 10)
    })

    const calibration = computeCalibration({
      bodyEntries: [
        bodyMetric('2026-06-27', 200),
        bodyMetric('2026-07-04', 198),
        bodyMetric('2026-07-11', 199),
        bodyMetric('2026-07-18', 199.5),
        bodyMetric('2026-07-25', 199.6),
      ],
      logs: dates.map((date) => nutritionLog(date, 2000)),
      stepsByDate: {},
      maintenance: 2500,
      stepBaseline: 10000,
      weightKg: 90,
      minCalories: 1200,
      unit: 'lb',
      windowStart: new Date('2026-06-20T00:00:00.000Z'),
      today: '2026-07-25',
      phase: 'cut',
    })

    expect(calibration.status).toBe('ok')
    expect(calibration.actualWeeklyLoss).toBeGreaterThan(0.45)
    expect(calibration.actualWeeklyLoss).toBeLessThan(0.55)
    expect(calibration.suggestion?.direction).toBe('lower')
  })
})
