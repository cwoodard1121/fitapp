import { describe, expect, it } from 'vitest'

import { appCalendarDate, sorenessLookupKey } from '@/lib/data/soreness'

describe('next-day soreness dates and keys', () => {
  it('uses the Toronto calendar day around UTC midnight', () => {
    expect(appCalendarDate('2026-07-30T02:00:00.000Z')).toBe('2026-07-29')
    expect(appCalendarDate('2026-07-30T05:00:00.000Z')).toBe('2026-07-30')
  })

  it('normalizes muscle names for stable lookups', () => {
    expect(sorenessLookupKey('session', '  Biceps   / Forearms ')).toBe(
      'session:biceps / forearms',
    )
  })
})
