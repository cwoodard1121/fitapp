import { describe, expect, it } from 'vitest'

import type { BodyMetric } from '@/lib/types'

import {
  buildBodyFatInterpretations,
  calculateNavyBodyFatPct,
  interpretBodyMetrics,
  median,
  navyMeasurementInISOWeek,
} from './body-fat'

function bodyMetric(
  date: string,
  {
    legacyBia = null,
    bia = null,
    navy = null,
  }: {
    legacyBia?: number | null
    bia?: number | null
    navy?: number | null
  } = {},
): BodyMetric {
  return {
    id: `body-${date}`,
    user_id: 'user-1',
    measured_on: date,
    bodyweight: 190,
    bodyfat_pct: legacyBia,
    bia_bodyfat_pct: bia,
    height_cm: navy == null ? null : 175.26,
    neck_cm: navy == null ? null : 40.64,
    waist_cm: navy == null ? null : 101.6,
    navy_bodyfat_pct: navy,
    notes: null,
    source: 'manual',
    created_at: `${date}T00:00:00.000Z`,
  }
}

describe('calculateNavyBodyFatPct', () => {
  it('matches the published male circumference-equation example', () => {
    expect(
      calculateNavyBodyFatPct({
        heightCm: 69 * 2.54,
        neckCm: 16 * 2.54,
        waistCm: 49 * 2.54,
      }),
    ).toBe(38.6)
  })

  it('rejects incomplete geometry where the waist is not larger than the neck', () => {
    expect(
      calculateNavyBodyFatPct({
        heightCm: 180,
        neckCm: 42,
        waistCm: 42,
      }),
    ).toBeNull()
  })
})

describe('body-fat interpretation', () => {
  it('computes odd and even medians without letting outliers dominate', () => {
    expect(median([19, 40, 20])).toBe(20)
    expect(median([18, 20, 22, 40])).toBe(21)
  })

  it('passes every legacy bodyfat_pct through as BIA before Navy data exists', () => {
    const entries = [
      bodyMetric('2026-07-01', { legacyBia: 20.2 }),
      bodyMetric('2026-07-02', { legacyBia: 19.8 }),
    ]

    expect(interpretBodyMetrics(entries).map((entry) => entry.bodyfat_pct)).toEqual([
      20.2,
      19.8,
    ])
  })

  it('weights Navy at 65% and the trailing seven-day BIA median at 35%', () => {
    const points = buildBodyFatInterpretations([
      bodyMetric('2026-07-01', { bia: 20 }),
      bodyMetric('2026-07-03', { bia: 22 }),
      bodyMetric('2026-07-07', { bia: 24, navy: 18 }),
    ])

    expect(points.at(-1)).toMatchObject({
      bodyfatPct: 19.4,
      basis: 'blended',
      navyBodyfatPct: 18,
      biaMedianPct: 22,
      biaSampleCount: 3,
    })
  })

  it('uses calendar days for the BIA window and carries Navy until next week', () => {
    const points = buildBodyFatInterpretations([
      bodyMetric('2026-07-01', { bia: 30 }),
      bodyMetric('2026-07-07', { bia: 20, navy: 18 }),
      bodyMetric('2026-07-08', { bia: 22 }),
    ])

    expect(points.at(-1)).toMatchObject({
      bodyfatPct: 19.1,
      navyBodyfatPct: 18,
      biaMedianPct: 21,
      biaSampleCount: 2,
    })
  })

  it('finds an existing Navy measurement only within the same ISO week', () => {
    const priorWeek = bodyMetric('2026-07-12', { navy: 19 })
    const thisWeek = bodyMetric('2026-07-13', { navy: 18.5 })
    const entries = [priorWeek, thisWeek]

    expect(navyMeasurementInISOWeek(entries, '2026-07-18')?.id).toBe(thisWeek.id)
    expect(
      navyMeasurementInISOWeek(entries, '2026-07-18', thisWeek.id),
    ).toBeNull()
  })
})
