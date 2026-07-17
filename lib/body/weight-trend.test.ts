import { describe, expect, it } from 'vitest'

import {
  buildBodyFatTrend,
  buildWeightTrend,
  summarizeWeightTrend,
  type WeightTrendInput,
} from './weight-trend'

const reading = (measured_on: string, bodyweight: number): WeightTrendInput => ({
  measured_on,
  bodyweight,
})

describe('buildBodyFatTrend', () => {
  it('builds a trailing seven-calendar-day average from body-fat readings', () => {
    const points = buildBodyFatTrend([
      { measured_on: '2026-01-01', bodyfat_pct: 20 },
      { measured_on: '2026-01-04', bodyfat_pct: 19 },
      { measured_on: '2026-01-07', bodyfat_pct: 18 },
    ])

    expect(points.find((point) => point.date === '2026-01-06')?.average).toBeNull()
    expect(points.at(-1)).toMatchObject({
      bodyfat: 18,
      average: 19,
      sampleCount: 3,
    })
  })

  it('keeps the average current through later bodyweight-only dates', () => {
    const points = buildBodyFatTrend(
      [
        { measured_on: '2026-01-01', bodyfat_pct: 20 },
        { measured_on: '2026-01-07', bodyfat_pct: 18 },
      ],
      7,
      '2026-01-10',
    )

    expect(points.at(-1)).toMatchObject({
      date: '2026-01-10',
      bodyfat: null,
      average: 18,
      sampleCount: 1,
    })
  })

  it('supports a trailing fourteen-calendar-day body-fat average', () => {
    const points = buildBodyFatTrend(
      [
        { measured_on: '2026-01-01', bodyfat_pct: 20 },
        { measured_on: '2026-01-08', bodyfat_pct: 19 },
        { measured_on: '2026-01-14', bodyfat_pct: 18 },
      ],
      14,
    )

    expect(points.find((point) => point.date === '2026-01-13')?.average).toBeNull()
    expect(points.at(-1)).toMatchObject({
      bodyfat: 18,
      average: 19,
      sampleCount: 3,
    })
  })
})

describe('buildWeightTrend', () => {
  it('waits for a complete seven-calendar-day window', () => {
    const points = buildWeightTrend([
      reading('2026-01-01', 200),
      reading('2026-01-07', 194),
    ])

    expect(points.find((point) => point.date === '2026-01-06')?.average).toBeNull()
    expect(points.find((point) => point.date === '2026-01-07')).toMatchObject({
      average: 197,
      sampleCount: 2,
    })
  })

  it('uses the prior six calendar days rather than the last seven entries', () => {
    const points = buildWeightTrend([
      reading('2026-01-01', 210),
      reading('2026-01-02', 208),
      reading('2026-01-03', 206),
      reading('2026-01-10', 200),
    ])

    expect(points.at(-1)).toMatchObject({
      date: '2026-01-10',
      weight: 200,
      average: 200,
      sampleCount: 1,
    })
  })

  it('creates daily average points across missing weigh-in days', () => {
    const points = buildWeightTrend([
      reading('2026-02-01', 200),
      reading('2026-02-04', 198),
      reading('2026-02-08', 196),
    ])

    expect(points).toHaveLength(8)
    expect(points.find((point) => point.date === '2026-02-07')).toMatchObject({
      weight: null,
      average: 199,
      sampleCount: 2,
    })
    expect(points.at(-1)).toMatchObject({ average: 197, sampleCount: 2 })
  })

  it('averages duplicate readings from the same day before the rolling average', () => {
    const points = buildWeightTrend([
      reading('2026-03-01', 200),
      reading('2026-03-01', 202),
      reading('2026-03-07', 198),
    ])

    expect(points.at(-1)).toMatchObject({ average: 199.5, sampleCount: 2 })
  })

  it('supports a trailing fourteen-calendar-day average', () => {
    const points = buildWeightTrend(
      [
        reading('2026-03-01', 210),
        reading('2026-03-07', 204),
        reading('2026-03-14', 198),
      ],
      14,
    )

    expect(points.find((point) => point.date === '2026-03-13')?.average).toBeNull()
    expect(points.at(-1)).toMatchObject({
      weight: 198,
      average: 204,
      sampleCount: 3,
    })
  })
})

describe('summarizeWeightTrend', () => {
  it('reports the selected-range percent change and weekly pace', () => {
    const points = buildWeightTrend(
      Array.from({ length: 21 }, (_, index) =>
        reading(`2026-04-${String(index + 1).padStart(2, '0')}`, 200 - index * 0.5),
      ),
    )

    const summary = summarizeWeightTrend(points, '2026-04-08', '2026-04-21')

    expect(summary).toMatchObject({
      startAverage: 198,
      currentAverage: 191.5,
      change: -6.5,
      percentChange: -3.28,
      weeklyRate: -3.5,
      elapsedDays: 13,
      currentSampleCount: 7,
      direction: 'down',
    })
  })

  it('returns an insufficient state when the selected range has one average', () => {
    const points = buildWeightTrend([
      reading('2026-05-01', 200),
      reading('2026-05-07', 198),
    ])

    expect(summarizeWeightTrend(points, '2026-05-07', '2026-05-07')).toMatchObject({
      currentAverage: 199,
      change: null,
      percentChange: null,
      direction: 'insufficient',
    })
  })
})
