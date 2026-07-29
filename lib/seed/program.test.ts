import { describe, expect, it } from 'vitest'

import { EXERCISE_CATALOG } from '@/lib/exercises/catalog'
import { exerciseNameKey } from '@/lib/exercises/identity'
import { DEFAULT_PROGRAM } from './program'

describe('DEFAULT_PROGRAM', () => {
  it('matches the canonical five-day routine', () => {
    expect(DEFAULT_PROGRAM.name).toBe('Five-Day Progression')
    expect(DEFAULT_PROGRAM.days).toHaveLength(5)

    expect(programShape()).toEqual([
      [
        ['Barbell Bench Press', 2, 5, 10],
        ['Incline Dumbbell Bench Press', 2, 6, 12],
        ['Pull-Up', 2, 5, 20],
        ['Barbell Row', 2, 6, 10],
        ['Dumbbell Lateral Raise', 2, 8, 15],
        ['Dumbbell Wrist Curl', 3, 10, 20],
      ],
      [
        ['EZ-Bar Curl', 4, 6, 12],
        ['Triceps Pushdown', 3, 6, 10],
        ['Cable Reverse Curl', 3, 8, 15],
        ['Cable Crunch', 2, 8, 15],
      ],
      [
        ['Pull-Up', 2, 5, 20],
        ['Barbell Row', 2, 6, 10],
        ['Incline Dumbbell Bench Press', 2, 6, 12],
        ['Cable Lateral Raise', 2, 8, 15],
      ],
      [
        ['Barbell Squat', 3, 6, 12],
        ['Deadlift', 2, 5, 8],
        ['Incline Dumbbell Curl', 3, 10, 15],
        ['Skull Crusher', 2, 10, 15],
      ],
      [
        ['Cable Lateral Raise', 3, 10, 15],
        ['Seated Dumbbell Lateral Raise', 2, 6, 12],
        ['Pull-Up', 2, 5, 20],
        ['Dumbbell Wrist Curl', 3, 10, 15],
      ],
    ])
  })

  it('marks every pull-up prescription as two bodyweight sets to failure', () => {
    const pullUps = DEFAULT_PROGRAM.days.flatMap((day) =>
      day.slots.filter((slot) => slot.exerciseName === 'Pull-Up'),
    )

    expect(pullUps).toHaveLength(3)
    for (const pullUp of pullUps) {
      expect(pullUp).toMatchObject({
        baseSets: 2,
        targetRir: 0,
        isBodyweight: true,
        seedLoad: null,
      })
    }
  })

  it('keeps every programmed movement in the exercise library', () => {
    const catalogKeys = new Set(
      EXERCISE_CATALOG.map((exercise) => exerciseNameKey(exercise.name)),
    )
    const programmedKeys = new Set(
      DEFAULT_PROGRAM.days.flatMap((day) =>
        day.slots.map((slot) => exerciseNameKey(slot.exerciseName)),
      ),
    )

    expect([...programmedKeys].filter((key) => !catalogKeys.has(key))).toEqual([])
  })
})

function programShape(): [string, number, number, number][][] {
  return DEFAULT_PROGRAM.days.map((day) =>
    day.slots.map((slot) => [
      slot.exerciseName,
      slot.baseSets,
      slot.repLow,
      slot.repHigh,
    ]),
  )
}
