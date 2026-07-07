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
      value: 198.2,
      rawLatest: 199.7,
      basis: 'block_floor',
    })
    expect(normalizedDeltaOver(entries, 7, block)).toBe(0.2)
  })

  it('estimates body fat from fixed lean mass after the first body-fat anchor', () => {
    const entries = [
      bodyMetric('2026-06-20', 200, 20),
      bodyMetric('2026-07-04', 190, null),
    ]

    const estimate = estimateBodyFatFromLeanRetention(entries)

    expect(estimate.basis).toBe('lean_retention')
    expect(estimate.baselineBodyfat).toBe(20)
    expect(estimate.latest).toBeCloseTo(15.8, 1)
    expect(estimateBodyFatAtWeightFromLeanRetention(entries, 188)).toBeCloseTo(14.9, 1)
  })
})
