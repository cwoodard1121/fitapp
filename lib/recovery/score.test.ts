import { describe, expect, it } from 'vitest'

import type { RecoveryMetric } from '@/lib/types'
import { computeRecoveryScore } from './score'

function metric(date: string, hrv: number): RecoveryMetric {
  return {
    id: date,
    user_id: 'user-1',
    metric_date: date,
    steps: 10_000,
    sleep_minutes_asleep: null,
    sleep_minutes_in_period: null,
    sleep_light_min: null,
    sleep_deep_min: null,
    sleep_rem_min: null,
    sleep_awake_min: null,
    resting_hr: null,
    hrv_ms: hrv,
    source: 'wearable',
    synced_at: `${date}T12:00:00.000Z`,
  }
}

describe('recovery score', () => {
  it('builds the personal baseline only from the current training block', () => {
    const history = [
      metric('2026-06-01', 100),
      metric('2026-06-02', 101),
      metric('2026-06-03', 102),
      metric('2026-06-04', 103),
      metric('2026-06-05', 104),
      metric('2026-06-06', 105),
      metric('2026-06-07', 106),
      metric('2026-06-08', 107),
      metric('2026-06-10', 40),
      metric('2026-06-11', 41),
      metric('2026-06-12', 42),
      metric('2026-06-13', 43),
      metric('2026-06-14', 44),
      metric('2026-06-15', 45),
      metric('2026-06-16', 46),
      metric('2026-06-17', 47),
    ]

    const allHistory = computeRecoveryScore(history, '2026-06-17')
    const currentBlock = computeRecoveryScore(history, '2026-06-17', {
      baselineStart: '2026-06-10',
    })

    expect(allHistory?.status).toBe('ok')
    expect(currentBlock?.status).toBe('ok')
    expect(currentBlock?.baselineDays).toBe(7)
    expect(currentBlock!.score).toBeGreaterThan(allHistory!.score)
  })
})
