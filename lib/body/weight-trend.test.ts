import { describe, expect, it } from 'vitest'

import {
  buildSevenDayWeightTrend,
  summarizeWeightTrend,
  type WeightTrendInput,
} from './weight-trend'

const reading = (measured_on: string, bodyweight: number): WeightTrendInput => ({
  measured_on,
  bodyweight,
})

describe('buildSevenDayWeightTrend', () => {
  it('waits for a complete seven-calendar-day window', () => {
    const points = buildSevenDayWeightTrend([
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
    const points = buildSevenDayWeightTrend([
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
    const points = buildSevenDayWeightTrend([
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
    const points = buildSevenDayWeightTrend([
      reading('2026-03-01', 200),
      reading('2026-03-01', 202),
      reading('2026-03-07', 198),
    ])

    expect(points.at(-1)).toMatchObject({ average: 199.5, sampleCount: 2 })
  })
})

describe('summarizeWeightTrend', () => {
  it('reports the selected-range percent change and weekly pace', () => {
    const points = buildSevenDayWeightTrend(
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
    const points = buildSevenDayWeightTrend([
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
