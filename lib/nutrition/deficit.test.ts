import { describe, expect, it } from 'vitest'

import type { NutritionLog } from '@/lib/types'
import { accumulateDeficit, estimateWeeklyTissueChange } from './deficit'

function nutritionLog(loggedOn: string, calories: number): NutritionLog {
  return {
    id: loggedOn,
    user_id: 'user',
    logged_on: loggedOn,
    calories,
    protein: null,
    carbs: null,
    fat: null,
    notes: null,
    source: 'manual',
    created_at: `${loggedOn}T12:00:00.000Z`,
  }
}

function result({
  logs,
  stepsByDate = {},
}: {
  logs: NutritionLog[]
  stepsByDate?: Record<string, number>
}) {
  return accumulateDeficit({
    logs,
    stepsByDate,
    baseMaint: 2800,
    weightKg: 70,
    stepBaseline: 10_000,
    ignoreLow: false,
    minCal: 1200,
    start: new Date(2026, 6, 15),
    end: new Date(2026, 6, 16),
    today: '2026-07-16',
  })
}

describe('accumulateDeficit', () => {
  it('counts every logged date as a full day, including today', () => {
    const r = result({
      logs: [nutritionLog('2026-07-15', 2000), nutritionLog('2026-07-16', 2300)],
    })

    expect(r.daysLogged).toBe(2)
    expect(r.sumCalories).toBe(4300)
    expect(r.sumMaint).toBe(5600)
    expect(r.deficit).toBe(1300)
  })

  it("does not adjust today's full-day maintenance from incomplete live steps", () => {
    const r = result({
      logs: [nutritionLog('2026-07-16', 300)],
      stepsByDate: { '2026-07-16': 1000 },
    })

    expect(r.totalAdjustment).toBe(0)
    expect(r.sumMaint).toBe(2800)
    expect(r.deficit).toBe(2500)
  })

  it('adjusts completed days around the fixed step baseline', () => {
    const r = result({
      logs: [
        nutritionLog('2026-07-15', 2000),
        nutritionLog('2026-07-16', 2300),
      ],
      stepsByDate: {
        '2026-07-15': 12_000,
        '2026-07-16': 1000,
      },
    })

    expect(r.totalAdjustment).toBe(80)
    expect(r.sumMaint).toBe(5680)
    expect(r.deficit).toBe(1380)
  })
})

describe('estimateWeeklyTissueChange', () => {
  it('normalizes logged days to a weekly loss rate', () => {
    expect(estimateWeeklyTissueChange(3500, 3.5, 'lb')).toBe(2)
  })

  it('uses metric tissue conversion and preserves gain direction', () => {
    expect(estimateWeeklyTissueChange(-3850, 7, 'kg')).toBe(-0.5)
  })

  it('returns zero when there are no logged day-equivalents', () => {
    expect(estimateWeeklyTissueChange(3500, 0, 'lb')).toBe(0)
  })
})
