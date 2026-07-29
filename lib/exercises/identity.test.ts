import { describe, expect, it } from 'vitest'

import { exerciseNameKey, nextGeneratedSlotCode } from './identity'

describe('exerciseNameKey', () => {
  it('treats casing and incidental whitespace as the same exercise', () => {
    expect(exerciseNameKey('  Incline   DB Press ')).toBe(exerciseNameKey('incline db press'))
  })

  it.each([
    ['Touch-and-go bench', 'Barbell Bench Press'],
    ['DB incline bench', 'Incline Dumbbell Bench Press'],
    ['Pull-up or pulldown', 'Pull-Up'],
    ['Row', 'Barbell Row'],
    ['DB lateral raise', 'Dumbbell Lateral Raise'],
    ['Barbell wrist curl', 'Dumbbell Wrist Curl'],
    ['Barbell curl', 'EZ-Bar Curl'],
    ['Pushdown', 'Triceps Pushdown'],
    ['Reverse curl', 'Cable Reverse Curl'],
    ['Squat', 'Barbell Squat'],
    ['Incline curl', 'Incline Dumbbell Curl'],
    ['Skullcrusher', 'Skull Crusher'],
    ['Seated lateral raise', 'Seated Dumbbell Lateral Raise'],
  ])('grandfathers %s history into %s', (legacyName, canonicalName) => {
    expect(exerciseNameKey(legacyName)).toBe(exerciseNameKey(canonicalName))
  })
})

describe('nextGeneratedSlotCode', () => {
  it('does not collide when an earlier slot was deleted', () => {
    expect(nextGeneratedSlotCode(1, ['D1A1', 'D1A3'])).toBe('D1A2')
    expect(nextGeneratedSlotCode(2, ['d2a1', 'D2A2'])).toBe('D2A3')
  })
})
