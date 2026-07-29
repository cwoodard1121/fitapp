import { describe, expect, it } from 'vitest'

import { chooseVolumeIncreaseWinners } from './volume-arbitration'

describe('chooseVolumeIncreaseWinners', () => {
  it('allows only the lowest-pump exercise from one muscle exposure', () => {
    const winners = chooseVolumeIncreaseWinners([
      { exposureKey: 'session:back', pump: 5 },
      { exposureKey: 'session:back', pump: 3 },
      { exposureKey: 'session:chest', pump: 4 },
    ])

    expect([...winners]).toEqual([1, 2])
  })

  it('uses program order as the stable tie breaker', () => {
    const winners = chooseVolumeIncreaseWinners([
      { exposureKey: 'session:side delts', pump: 4 },
      { exposureKey: 'session:side delts', pump: 4 },
      null,
    ])

    expect([...winners]).toEqual([0])
  })
})
