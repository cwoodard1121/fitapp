import { describe, expect, it } from 'vitest'

import { exerciseNameKey, nextGeneratedSlotCode } from './identity'

describe('exerciseNameKey', () => {
  it('treats casing and incidental whitespace as the same exercise', () => {
    expect(exerciseNameKey('  Incline   DB Press ')).toBe(exerciseNameKey('incline db press'))
  })
})

describe('nextGeneratedSlotCode', () => {
  it('does not collide when an earlier slot was deleted', () => {
    expect(nextGeneratedSlotCode(1, ['D1A1', 'D1A3'])).toBe('D1A2')
    expect(nextGeneratedSlotCode(2, ['d2a1', 'D2A2'])).toBe('D2A3')
  })
})
