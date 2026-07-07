import { describe, expect, it } from 'vitest'

import type { BodyMetric } from '@/lib/types'

import {
  estimateBodyFatAtWeightFromLeanRetention,
  estimateBodyFatFromLeanRetention,
  normalizedBodyweight,
  normalizedDeltaOver,
} from './metrics'

function bodyMetric(date: string, bodyweight: number, bodyfatPct: number | null = null): BodyMetric {
  return {
    id: `body-${date}`,
    user_id: 'user-1',
    measured_on: date,
    bodyweight,
    bodyfat_pct: bodyfatPct,
    notes: null,
    source: 'manual',
    created_at: `${date}T00:00:00.000Z`,
  }
}

describe('body metric helpers', () => {
  it('uses the active cut block floor for dashboard bodyweight', () => {
    const entries = [
      bodyMetric('2026-06-20', 200),
      bodyMetric('2026-06-27', 198),
      bodyMetric('2026-06-30', 198.3),
      bodyMetric('2026-07-04', 199.7),
    ]
    const block = { phase: 'cut' as const, start_date: '2026-06-20' }

    expect(normalizedBodyweight(entries, block)).toMatchObject({
      value: 198,
      rawLatest: 199.7,
      basis: 'block_floor',
    })
    expect(normalizedDeltaOver(entries, 7, block)).toBe(0)
  })

  it('estimates body fat with a 2% dry-water allowance from the recent high', () => {
    const entries = [
      bodyMetric('2026-06-20', 200, 20),
      bodyMetric('2026-07-04', 190, null),
    ]

    const estimate = estimateBodyFatFromLeanRetention(entries)

    expect(estimate.basis).toBe('lean_retention')
    expect(estimate.baselineBodyfat).toBe(20)
    expect(estimate.latest).toBeCloseTo(17.9, 1)
    expect(estimateBodyFatAtWeightFromLeanRetention(entries, 188)).toBeCloseTo(17, 1)
  })

  it('scopes body-fat estimate points to the active block after the anchor', () => {
    const entries = [
      bodyMetric('2026-06-01', 205, null),
      bodyMetric('2026-06-10', 202, 22),
      bodyMetric('2026-06-20', 200, null),
      bodyMetric('2026-06-30', 198, null),
    ]
    const block = { start_date: '2026-06-15' }

    const estimate = estimateBodyFatFromLeanRetention(entries, block)

    expect(estimate.points.map((p) => p.date)).toEqual(['2026-06-20', '2026-06-30'])
  })

  it('uses high relative strength as a weighted body-fat signal', () => {
    const entries = [
      bodyMetric('2026-06-20', 182, 22),
      bodyMetric('2026-07-04', 182, null),
    ]
    const strength = [
      { date: '2026-07-02', exerciseName: 'Barbell bench press', e1rm: 300 },
    ]

    const estimate = estimateBodyFatFromLeanRetention(entries, { start_date: '2026-06-20' }, strength)

    expect(estimate.latest).toBeCloseTo(19.8, 1)
  })
})
