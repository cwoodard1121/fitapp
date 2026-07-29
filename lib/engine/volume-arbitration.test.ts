import { describe, expect, it } from 'vitest'

import { chooseVolumeIncreaseWinners } from './volume-arbitration'

describe('chooseVolumeIncreaseWinners', () => {
  it('allows only the lowest-pump exercise for one upcoming muscle/day', () => {
    const winners = chooseVolumeIncreaseWinners([
      { groupKey: 'upcoming-session:back', pump: 5 },
      { groupKey: 'upcoming-session:back', pump: 3 },
      { groupKey: 'upcoming-session:chest', pump: 4 },
    ])

    expect([...winners]).toEqual([1, 2])
  })

  it('uses program order as the stable tie breaker', () => {
    const winners = chooseVolumeIncreaseWinners([
      { groupKey: 'upcoming-session:side delts', pump: 4 },
      { groupKey: 'upcoming-session:side delts', pump: 4 },
      null,
    ])

    expect([...winners]).toEqual([0])
  })

  it('groups candidates by their upcoming muscle even when prior sources differ', () => {
    const winners = chooseVolumeIncreaseWinners([
      // These pumps may come from different historical sessions, but both
      // exercises train back in the same upcoming workout.
      { groupKey: 'upcoming-session:back', pump: 2 },
      { groupKey: 'upcoming-session:back', pump: 1 },
    ])

    expect([...winners]).toEqual([1])
  })
})
