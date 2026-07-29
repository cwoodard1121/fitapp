import { describe, expect, it } from 'vitest'

import type { ExerciseSlot, Session, SetLog } from '@/lib/types'
import {
  attachSessionContextToLogs,
  canCarryProgression,
  mergeSessionExerciseSlots,
  trainingLogTimestamp,
  trainingWeekKey,
} from './training-history'

function session(
  id: string,
  performedAt: string,
  mesocycle: number,
): Session {
  return {
    id,
    user_id: 'user',
    program_id: 'program',
    day_id: 'day',
    schedule_version: 'schedule',
    mesocycle,
    week: 1,
    performed_at: performedAt,
    status: 'done',
    created_at: performedAt,
  }
}

function log(id: string, sessionId: string, createdAt: string): SetLog {
  return {
    id,
    user_id: 'user',
    session_id: sessionId,
    slot_id: 'slot',
    week: 1,
    actual_load: 100,
    best_reps: 10,
    actual_sets: 2,
    actual_rir: 2,
    target_load: 100,
    target_sets: 2,
    target_reps: 10,
    target_rir: 2,
    hit_rir_override: null,
    pump: null,
    pain: null,
    enjoyment: null,
    soreness: null,
    recovery: null,
    performance: null,
    notes: null,
    created_at: createdAt,
  }
}

function slot(id: string, code: string, orderIndex: number): ExerciseSlot {
  return {
    id,
    day_id: 'day',
    user_id: 'user',
    slot_code: code,
    order_index: orderIndex,
    exercise_name: id,
    muscle_area: 'Chest',
    progress_bias: 'Reps first',
    rep_low: 6,
    rep_high: 12,
    target_rir: 2,
    base_sets: 2,
    load_increment: 5,
    seed_load: null,
    is_bodyweight: false,
  }
}

describe('training history context', () => {
  it('sorts retroactive logs by workout time and keeps repeated weeks distinct', () => {
    const older = session('older', '2026-07-01T12:00:00.000Z', 0)
    const newer = session('newer', '2026-08-05T12:00:00.000Z', 1)
    const logs = attachSessionContextToLogs(
      [
        log('newer-log', newer.id, '2026-08-05T13:00:00.000Z'),
        log('older-log', older.id, '2026-08-20T13:00:00.000Z'),
      ],
      [newer, older],
    )

    expect(logs.map((row) => row.id)).toEqual(['older-log', 'newer-log'])
    expect(trainingLogTimestamp(logs[0])).toBe(older.performed_at)
    expect(trainingWeekKey(logs[0])).not.toBe(trainingWeekKey(logs[1]))
  })

  it('uses the log timestamp before a precreated session timestamp', () => {
    const row = {
      ...log(
        'planned-session-log',
        'planned-session',
        '2026-07-10T12:00:00.000Z',
      ),
      session_performed_at: null,
      session_created_at: '2026-07-01T12:00:00.000Z',
    }

    expect(trainingLogTimestamp(row)).toBe(row.created_at)
  })

  it('keeps logged retired exercises in place after a live program edit', () => {
    const activeReplacement = {
      ...slot('replacement', 'NEW-CODE', 0),
      lineage_slot_id: 'logged-old',
    }
    const untouched = slot('untouched', 'D1B', 1)
    // The original code and position both changed in the same edit; explicit
    // lineage is the only reliable match.
    const retiredReplacement = slot('logged-old', 'OLD-CODE', -1_000_004)
    const retiredRemoval = slot('logged-removed', 'D1C', -1_000_002)

    const merged = mergeSessionExerciseSlots(
      [activeReplacement, untouched],
      [retiredReplacement, retiredRemoval],
      new Set([retiredReplacement.id, retiredRemoval.id]),
    )

    expect(merged.map((row) => row.id)).toEqual([
      'logged-old',
      'untouched',
      'logged-removed',
    ])
    expect(merged.map((row) => row.order_index)).toEqual([0, 1, 2])
  })

  it('does not let legacy feedback-only rows reset objective carry', () => {
    const legacySkip = {
      ...log('legacy-skip', 'session', '2026-07-01T12:00:00.000Z'),
      actual_load: null,
      best_reps: null,
      actual_sets: null,
      actual_rir: null,
      target_load: null,
      target_sets: null,
      target_reps: null,
      target_rir: null,
      hit_rir_override: 'Skip' as const,
    }

    expect(canCarryProgression(legacySkip)).toBe(false)
    expect(
      canCarryProgression({ ...legacySkip, target_sets: 2, target_reps: 10 }),
    ).toBe(true)
  })
})
