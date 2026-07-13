import { describe, expect, it } from 'vitest'

import { DEFAULT_PROGRAM } from './program'

describe('DEFAULT_PROGRAM', () => {
  it('matches the shortened four-day routine', () => {
    const [day1, day2, day3, day4] = DEFAULT_PROGRAM.days

    expect(day1.slots.map((slot) => [slot.exerciseName, slot.baseSets])).toEqual([
      ['Touch-and-go bench', 2],
      ['DB incline bench', 2],
      ['Pull-up', 2],
      ['DB lateral raise', 3],
    ])

    expect(day2.slots.map((slot) => slot.exerciseName)).toEqual([
      'Cable lateral raise',
      'Seated lateral raise',
      'Barbell curl',
      'Incline curl',
      'Pushdown',
      'Overhead cable triceps extension',
      'Reverse curl',
    ])

    expect(day3.label).toBe('Day 3 Chest / Back / Legs')
    expect(day3.slots.map((slot) => slot.exerciseName)).toEqual([
      'Pull-up or pulldown',
      'Row',
      'DB incline bench',
      'Squat',
      'Deadlift',
    ])

    expect(day4.slots.find((slot) => slot.exerciseName === 'Rear-delt fly')?.baseSets).toBe(2)
    expect(day4.slots.some((slot) => slot.exerciseName === 'Close-grip bench or dip')).toBe(false)
    expect(day4.slots.find((slot) => slot.exerciseName === 'Skullcrusher')).toMatchObject({
      baseSets: 2,
      repLow: 8,
      repHigh: 12,
    })
  })
})
