import { describe, expect, it } from 'vitest'

import type { NutritionLog } from '@/lib/types'
import { accumulateDeficit, fractionOfDayElapsed } from './deficit'

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
  currentDayProgress,
}: {
  logs: NutritionLog[]
  stepsByDate?: Record<string, number>
  currentDayProgress: number
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
    currentDayProgress,
  })
}

describe('accumulateDeficit', () => {
  it('counts completed days fully and only the elapsed portion of today', () => {
    const r = result({
      logs: [nutritionLog('2026-07-15', 2000), nutritionLog('2026-07-16', 300)],
      currentDayProgress: 0.375,
    })

    expect(r.daysLogged).toBe(2)
    expect(r.dayEquivalents).toBe(1.375)
    expect(r.sumCalories).toBe(2300)
    expect(r.sumMaint).toBe(3850)
    expect(r.deficit).toBe(1550)
  })

  it("compares today's steps with the elapsed share of the step baseline", () => {
    const r = result({
      logs: [nutritionLog('2026-07-16', 300)],
      stepsByDate: { '2026-07-16': 1000 },
      currentDayProgress: 0.375,
    })

    expect(r.totalAdjustment).toBe(-110)
    expect(r.sumMaint).toBe(940)
    expect(r.deficit).toBe(640)
  })

  it('adds expenditure above the fixed step baseline', () => {
    const r = result({
      logs: [nutritionLog('2026-07-16', 300)],
      stepsByDate: { '2026-07-16': 5000 },
      currentDayProgress: 0.375,
    })

    expect(r.totalAdjustment).toBe(50)
    expect(r.sumMaint).toBe(1100)
    expect(r.deficit).toBe(800)
  })

  it('counts today in full once its date has passed', () => {
    const r = result({
      logs: [nutritionLog('2026-07-16', 2200)],
      currentDayProgress: 1,
    })

    expect(r.dayEquivalents).toBe(1)
    expect(r.sumMaint).toBe(2800)
    expect(r.deficit).toBe(600)
  })
})

describe('fractionOfDayElapsed', () => {
  it('returns the elapsed fraction of the local calendar day', () => {
    expect(fractionOfDayElapsed(new Date(2026, 6, 16, 9))).toBeCloseTo(0.375, 6)
  })
})
