import { describe, expect, it } from 'vitest'

import { DEFAULT_WEIGHTS, type SlotConfig } from '../engine/engine'
import { EXERCISE_CATALOG } from '../exercises/catalog'
import type { ExerciseSlot, SetLog } from '../types'
import {
  aggregateFromEntries,
  derivePrevTargets,
  slotConfigFromRow,
} from './mappers'

const slot: SlotConfig = {
  progressBias: 'Reps first',
  repLow: 8,
  repHigh: 15,
  targetRir: 3,
  baseSets: 2,
  loadIncrement: 5,
  seedLoad: 75,
  isBodyweight: false,
  allowSetProgression: true,
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
  target_load: null,
  target_sets: null,
  target_reps: null,
  target_rir: null,
  hit_rir_override: null,
  pump: null,
  enjoyment: null,
  soreness: null,
  pain: null,
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
    expect(tuned.prevNextReps).toBe(12)
  })

  it('uses the prescription saved with the prior workout', () => {
    const missedPrescription = derivePrevTargets(
      slot,
      {
        ...priorLog,
        target_load: 85,
        target_sets: 2,
        target_reps: 10,
      },
      2,
      5,
      DEFAULT_WEIGHTS,
    )

    expect(missedPrescription.decision).toBe('Maintain')
    expect(missedPrescription.prevNextLoad).toBe(80)
    expect(missedPrescription.prevNextReps).toBe(10)
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

  it('restores the pre-deload carry for the next cycle', () => {
    const deloadOutcome = derivePrevTargets(
      slot,
      {
        ...priorLog,
        week: 5,
        actual_load: 72,
        best_reps: 10,
        actual_sets: 1,
        target_load: 72,
        target_sets: 1,
        target_reps: 10,
      },
      5,
      5,
      DEFAULT_WEIGHTS,
      null,
      {
        prevNextLoad: 80,
        prevNextSets: 2,
        prevNextReps: 11,
        decision: 'Add 1 rep',
      },
    )

    expect(deloadOutcome.prevNextLoad).toBe(80)
    expect(deloadOutcome.prevNextSets).toBe(2)
    expect(deloadOutcome.prevNextReps).toBe(11)

    const repeatedDeloadExposure = derivePrevTargets(
      slot,
      {
        ...priorLog,
        week: 5,
        actual_load: 72,
        best_reps: 10,
        actual_sets: 1,
        target_load: 72,
        target_sets: 1,
        target_reps: 10,
      },
      5,
      5,
      DEFAULT_WEIGHTS,
      null,
      {
        prevNextLoad: 80,
        prevNextSets: 2,
        prevNextReps: 11,
        decision: 'Add 1 rep',
      },
    )
    expect(repeatedDeloadExposure.prevNextLoad).toBe(80)
    expect(repeatedDeloadExposure.prevNextSets).toBe(2)
  })
})

describe('aggregateFromEntries', () => {
  it('keeps the strongest set for load and reps but uses the lowest performed RIR', () => {
    const aggregate = aggregateFromEntries([
      { load: 100, reps: 10, rir: 3 },
      { load: 105, reps: 6, rir: 0 },
    ])

    expect(aggregate).toEqual({
      actual_load: 100,
      best_reps: 10,
      actual_sets: 2,
      actual_rir: 0,
    })
  })

  it('ignores target-prefilled load rows until reps are entered', () => {
    expect(
      aggregateFromEntries([
        { load: 100, reps: null, rir: null },
        { load: 95, reps: 8, rir: 2 },
      ]),
    ).toEqual({
      actual_load: 95,
      best_reps: 8,
      actual_sets: 1,
      actual_rir: 2,
    })
  })
})

describe('slotConfigFromRow', () => {
  const row: ExerciseSlot = {
    id: 'slot',
    day_id: 'day',
    user_id: 'user',
    slot_code: 'D1A1',
    order_index: 0,
    exercise_name: 'Barbell Bench Press',
    muscle_area: 'Chest',
    progress_bias: 'Reps first',
    rep_low: 5,
    rep_high: 10,
    target_rir: 2,
    base_sets: 2,
    load_increment: 5,
    seed_load: null,
    is_bodyweight: false,
  }

  it('derives set progression from catalog metadata through historical aliases', () => {
    expect(
      slotConfigFromRow({
        ...row,
        exercise_name: 'Incline DB Press',
      }).allowSetProgression,
    ).toBe(true)
    expect(slotConfigFromRow(row).allowSetProgression).toBe(false)
  })

  it('enables automatic set progression only for the selected accessories', () => {
    expect(
      EXERCISE_CATALOG.filter(
        (exercise) => exercise.allowSetProgression,
      ).map((exercise) => exercise.name),
    ).toEqual([
      'Incline Dumbbell Bench Press',
      'Dumbbell Lateral Raise',
      'Cable Lateral Raise',
      'Seated Dumbbell Lateral Raise',
      'EZ-Bar Curl',
      'Incline Dumbbell Curl',
      'Triceps Pushdown',
      'Skull Crusher',
      'Dumbbell Wrist Curl',
      'Cable Reverse Curl',
      'Cable Crunch',
    ])
  })
})
