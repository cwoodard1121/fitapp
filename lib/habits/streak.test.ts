import { describe, expect, it } from 'vitest'

import { calculateHabitStreak } from './streak'

describe('calculateHabitStreak', () => {
  it('returns an empty summary without completions', () => {
    expect(calculateHabitStreak([], '2026-08-03')).toEqual({
      completedToday: false,
      currentStreak: 0,
      bestStreak: 0,
      totalCompletions: 0,
    })
  })

  it('anchors the current streak on today when today is complete', () => {
    expect(
      calculateHabitStreak(
        ['2026-07-31', '2026-08-01', '2026-08-02', '2026-08-03'],
        '2026-08-03',
      ),
    ).toEqual({
      completedToday: true,
      currentStreak: 4,
      bestStreak: 4,
      totalCompletions: 4,
    })
  })

  it('anchors the current streak on yesterday while today is pending', () => {
    expect(
      calculateHabitStreak(
        ['2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02'],
        '2026-08-03',
      ),
    ).toEqual({
      completedToday: false,
      currentStreak: 4,
      bestStreak: 4,
      totalCompletions: 4,
    })
  })

  it('returns a zero current streak when neither today nor yesterday is complete', () => {
    expect(
      calculateHabitStreak(
        ['2026-07-27', '2026-07-28', '2026-07-29'],
        '2026-08-03',
      ),
    ).toEqual({
      completedToday: false,
      currentStreak: 0,
      bestStreak: 3,
      totalCompletions: 3,
    })
  })

  it('reports the longest historical run separately from the current run', () => {
    expect(
      calculateHabitStreak(
        [
          '2026-07-20',
          '2026-07-21',
          '2026-07-22',
          '2026-07-23',
          '2026-08-01',
          '2026-08-02',
        ],
        '2026-08-03',
      ),
    ).toEqual({
      completedToday: false,
      currentStreak: 2,
      bestStreak: 4,
      totalCompletions: 6,
    })
  })

  it('deduplicates dates and ignores malformed, impossible, and future dates', () => {
    expect(
      calculateHabitStreak(
        [
          '2026-08-01',
          '2026-08-01',
          '2026-08-02',
          '2026-08-03',
          '2026-08-04',
          '2026-02-29',
          '2026-13-01',
          'not-a-date',
          '2026-8-2',
        ],
        '2026-08-03',
      ),
    ).toEqual({
      completedToday: true,
      currentStreak: 3,
      bestStreak: 3,
      totalCompletions: 3,
    })
  })

  it('accepts real leap days', () => {
    expect(
      calculateHabitStreak(
        ['2024-02-28', '2024-02-29', '2024-03-01'],
        '2024-03-01',
      ),
    ).toEqual({
      completedToday: true,
      currentStreak: 3,
      bestStreak: 3,
      totalCompletions: 3,
    })
  })

  it('rejects an invalid today boundary', () => {
    expect(() => calculateHabitStreak(['2026-08-01'], '2026-02-29')).toThrow(
      'today must be a valid yyyy-MM-dd date',
    )
  })
})
