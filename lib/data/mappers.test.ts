import { describe, expect, it } from 'vitest'

import { DEFAULT_WEIGHTS, type SlotConfig } from '../engine/engine'
import type { SetLog } from '../types'
import { derivePrevTargets } from './mappers'

const slot: SlotConfig = {
  progressBias: 'Reps first',
  repLow: 8,
  repHigh: 15,
  targetRir: 3,
  baseSets: 2,
  loadIncrement: 5,
  seedLoad: 75,
  isBodyweight: false,
}

const priorLog: SetLog = {
  id: 'log',
  user_id: 'user',
  session_id: 'session',
  slot_id: 'slot',
  week: 2,
  actual_load: 80,
  best_reps: 10,
  actual_sets: 2,
  actual_rir: 3,
  hit_rir_override: null,
  pump: null,
  enjoyment: null,
  soreness: null,
  recovery: 8,
  performance: null,
  notes: null,
  created_at: '2026-07-20T12:00:00.000Z',
}

describe('derivePrevTargets', () => {
  it('carries objective progression forward with default or custom score weights', () => {
    const defaults = derivePrevTargets(slot, priorLog, 2, 5, DEFAULT_WEIGHTS)
    const tuned = derivePrevTargets(slot, priorLog, 2, 5, {
      ...DEFAULT_WEIGHTS,
      recoveryGood: 5,
    })

    expect(defaults.prevNextReps).toBe(11)
    expect(tuned.prevNextReps).toBe(11)
  })

  it('feeds persisted next-day soreness into the strict set decision', () => {
    const lowPumpLog = { ...priorLog, pump: 4 }
    const lowSoreness = derivePrevTargets(
      slot,
      lowPumpLog,
      2,
      5,
      DEFAULT_WEIGHTS,
      1,
    )
    const confirmedStimulus = derivePrevTargets(
      slot,
      lowPumpLog,
      2,
      5,
      DEFAULT_WEIGHTS,
      4,
    )

    expect(lowSoreness.prevNextSets).toBe(3)
    expect(confirmedStimulus.prevNextSets).toBe(2)
    expect(confirmedStimulus.prevNextReps).toBe(11)
  })
})
