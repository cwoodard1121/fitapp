import { describe, expect, it } from 'vitest'

import { mesocycleNumber, weekForDate } from './week'

describe('calendar-based training weeks', () => {
  it('rolls the week at the athlete calendar midnight, not server UTC midnight', () => {
    const start = '2026-07-29'

    expect(
      weekForDate(
        start,
        5,
        new Date('2026-08-05T03:59:59.000Z'),
        'America/Toronto',
      ),
    ).toBe(1)
    expect(
      weekForDate(
        start,
        5,
        new Date('2026-08-05T04:00:00.000Z'),
        'America/Toronto',
      ),
    ).toBe(2)
  })

  it('continues into a new mesocycle after every complete block', () => {
    const start = '2026-07-29'
    const cycleTwo = new Date('2026-09-02T04:00:00.000Z')

    expect(weekForDate(start, 5, cycleTwo, 'America/Toronto')).toBe(1)
    expect(mesocycleNumber(start, 5, cycleTwo, 'America/Toronto')).toBe(1)
  })

  it('keeps invalid or pre-start dates at the first week and cycle', () => {
    expect(weekForDate('not-a-date', 5)).toBe(1)
    expect(mesocycleNumber('not-a-date', 5)).toBe(0)
    expect(
      weekForDate(
        '2026-07-29',
        5,
        new Date('2026-07-20T12:00:00.000Z'),
        'America/Toronto',
      ),
    ).toBe(1)
  })
})
