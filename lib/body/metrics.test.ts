import { describe, expect, it } from 'vitest'

import type { BodyMetric } from '@/lib/types'
import { interpretBodyMetrics } from './body-fat'

import {
  estimateBodyFatBreakdown,
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
    bia_bodyfat_pct: bodyfatPct,
    height_cm: null,
    neck_cm: null,
    waist_cm: null,
    navy_bodyfat_pct: null,
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

  it('does not add a water allowance until weight has actually fallen', () => {
    const entries = [bodyMetric('2026-07-01', 200, 20)]

    expect(estimateBodyFatBreakdown(entries, 200, '2026-07-01')).toMatchObject({
      finalEstimate: 20,
      observedWeightLoss: 0,
      dryWaterDrop: 0,
    })
  })

  it('recalibrates a cut projection to fresher Navy and BIA evidence', () => {
    const oldReading = bodyMetric('2026-07-01', 200, 21.1)
    const currentReading = bodyMetric('2026-07-10', 195, 20.2)
    currentReading.navy_bodyfat_pct = 18

    const interpreted = interpretBodyMetrics([oldReading, currentReading])
    const estimate = estimateBodyFatFromLeanRetention(interpreted, {
      start_date: '2026-07-01',
    })

    expect(interpreted.at(-1)?.bodyfat_pct).toBe(18.8)
    expect(estimate).toMatchObject({
      latest: 18.8,
      baselineDate: '2026-07-10',
      baselineBodyfat: 18.8,
    })
    expect(estimate.breakdown).toMatchObject({
      finalEstimate: 18.8,
      observedWeightLoss: 0,
      dryWaterDrop: 0,
    })
  })

  it('pairs a tape-only recalibration with the latest recent weigh-in', () => {
    const weighIn = bodyMetric('2026-07-10', 195, 20.2)
    const tapeOnly = bodyMetric('2026-07-11', 0, null)
    tapeOnly.bodyweight = null
    tapeOnly.navy_bodyfat_pct = 18

    const interpreted = interpretBodyMetrics([weighIn, tapeOnly])
    const estimate = estimateBodyFatFromLeanRetention(interpreted, {
      start_date: '2026-07-01',
    })

    expect(estimate.latest).toBe(18.8)
    expect(estimate.points.at(-1)).toMatchObject({
      date: '2026-07-11',
      bodyweight: 195,
      bodyfat: 18.8,
    })
    expect(estimate.breakdown).toMatchObject({
      baselineDate: '2026-07-11',
      baselineWeightDate: '2026-07-10',
    })
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

  it('uses the running block floor for body-fat estimate points', () => {
    const entries = [
      bodyMetric('2026-06-20', 200, 20),
      bodyMetric('2026-06-27', 190, null),
      bodyMetric('2026-06-30', 195, null),
    ]

    const estimate = estimateBodyFatFromLeanRetention(entries, { start_date: '2026-06-20' })

    expect(estimate.points[estimate.points.length - 1]).toMatchObject({
      date: '2026-06-30',
      bodyweight: 190,
    })
    expect(estimate.latest).toBeCloseTo(17.9, 1)
  })

  it('does not let newly imported pre-block history replace the current block anchor', () => {
    const currentEntries = [
      bodyMetric('2026-06-20', 200, 20),
      bodyMetric('2026-07-04', 190, null),
    ]
    const historicalEntry = bodyMetric('2025-08-01', 240, 35)
    const block = { start_date: '2026-06-20' }

    const beforeImport = estimateBodyFatFromLeanRetention(currentEntries, block)
    const afterImport = estimateBodyFatFromLeanRetention(
      [historicalEntry, ...currentEntries],
      block,
    )

    expect(afterImport.baselineDate).toBe('2026-06-20')
    expect(afterImport.latest).toBe(beforeImport.latest)
  })

})
