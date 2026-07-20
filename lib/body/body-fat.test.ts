import { describe, expect, it } from 'vitest'

import type { BodyMetric } from '@/lib/types'

import {
  buildBodyFatInterpretations,
  calculateNavyBodyFatPct,
  interpretBodyMetrics,
  median,
  navyBodyFatSummaryInISOWeek,
  navyMeasurementsInISOWeek,
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

  it('uses calendar days for the BIA window and carries the Navy average forward', () => {
    const points = buildBodyFatInterpretations([
      bodyMetric('2026-06-30', { bia: 30 }),
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

  it('averages all accepted Navy readings in an ISO week', () => {
    const entries = [
      bodyMetric('2026-07-13', { bia: 20 }),
      bodyMetric('2026-07-14', { navy: 18 }),
      bodyMetric('2026-07-16', { navy: 22 }),
    ]

    expect(navyBodyFatSummaryInISOWeek(entries, '2026-07-18')).toMatchObject({
      bodyfatPct: 20,
      acceptedSampleCount: 2,
      excludedSampleCount: 0,
      totalSampleCount: 2,
    })
    expect(buildBodyFatInterpretations(entries).at(-1)).toMatchObject({
      navyBodyfatPct: 20,
      navySampleCount: 2,
      navyExcludedSampleCount: 0,
    })
  })

  it('excludes Navy readings more than 20% from the non-Navy BIA reference', () => {
    const entries = [
      bodyMetric('2026-07-13', { bia: 20 }),
      bodyMetric('2026-07-14', { navy: 24 }),
      bodyMetric('2026-07-15', { navy: 24.1 }),
      bodyMetric('2026-07-16', { navy: 18 }),
    ]

    const summary = navyBodyFatSummaryInISOWeek(entries, '2026-07-18')
    expect(summary).toMatchObject({
      bodyfatPct: 21,
      acceptedSampleCount: 2,
      excludedSampleCount: 1,
      totalSampleCount: 3,
    })
    expect(summary?.samples.map((sample) => sample.accepted)).toEqual([
      true,
      false,
      true,
    ])
  })

  it('does not let an excluded reading replace the prior accepted weekly anchor', () => {
    const points = buildBodyFatInterpretations([
      bodyMetric('2026-07-06', { bia: 20 }),
      bodyMetric('2026-07-07', { navy: 19 }),
      bodyMetric('2026-07-13', { navy: 30 }),
    ])

    expect(points.at(-1)).toMatchObject({
      bodyfatPct: 19,
      basis: 'navy',
      navyBodyfatPct: 19,
      navySampleCount: 1,
    })
  })

  it('averages Navy readings when no non-Navy reference exists', () => {
    const summary = navyBodyFatSummaryInISOWeek(
      [
        bodyMetric('2026-07-14', { navy: 16 }),
        bodyMetric('2026-07-16', { navy: 24 }),
      ],
      '2026-07-18',
    )

    expect(summary).toMatchObject({
      bodyfatPct: 20,
      acceptedSampleCount: 2,
      excludedSampleCount: 0,
    })
  })

  it('finds all Navy measurements only within the same ISO week', () => {
    const priorWeek = bodyMetric('2026-07-12', { navy: 19 })
    const monday = bodyMetric('2026-07-13', { navy: 18.5 })
    const friday = bodyMetric('2026-07-17', { navy: 18 })
    const entries = [priorWeek, monday, friday]

    expect(
      navyMeasurementsInISOWeek(entries, '2026-07-18').map((entry) => entry.id),
    ).toEqual([monday.id, friday.id])
    expect(
      navyMeasurementsInISOWeek(entries, '2026-07-18', monday.id).map(
        (entry) => entry.id,
      ),
    ).toEqual([friday.id])
  })
})
