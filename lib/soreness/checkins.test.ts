import { describe, expect, it } from 'vitest'

import type { ExerciseSlot, Session, SetLog } from '@/lib/types'
import {
  buildSorenessCheckInPrompts,
  mergeSorenessRating,
  normalizeMuscleKey,
} from './checkins'

function session(id: string, performedAt: string): Pick<Session, 'id' | 'performed_at'> {
  return { id, performed_at: performedAt }
}

function slot(
  id: string,
  exerciseName: string,
  muscleArea: string | null,
): Pick<ExerciseSlot, 'id' | 'exercise_name' | 'muscle_area'> {
  return { id, exercise_name: exerciseName, muscle_area: muscleArea }
}

function log(
  sessionId: string,
  slotId: string,
): Pick<SetLog, 'session_id' | 'slot_id' | 'actual_sets' | 'best_reps'> {
  return { session_id: sessionId, slot_id: slotId, actual_sets: 3, best_reps: 10 }
}

describe('buildSorenessCheckInPrompts', () => {
  it('offers trained muscles on calendar days one and two, but not day zero or day three', () => {
    const prompts = buildSorenessCheckInPrompts({
      today: '2026-07-31',
      sessions: [
        session('today', '2026-07-31T08:00:00'),
        session('one', '2026-07-30T08:00:00'),
        session('two', '2026-07-29T08:00:00'),
        session('three', '2026-07-28T08:00:00'),
      ],
      logs: [
        log('today', 'today-slot'),
        log('one', 'one-slot'),
        log('two', 'two-slot'),
        log('three', 'three-slot'),
      ],
      slots: [
        slot('today-slot', 'Today press', 'Today muscle'),
        slot('one-slot', 'Bench press', 'Chest'),
        slot('two-slot', 'Barbell curl', 'Biceps'),
        slot('three-slot', 'Old row', 'Back'),
      ],
    })

    expect(prompts.map((prompt) => [prompt.muscleArea, prompt.daysAfter])).toEqual([
      ['Biceps', 2],
      ['Chest', 1],
    ])
  })

  it('groups exercises by muscle, prefers its latest workout, and skips today\'s report', () => {
    const prompts = buildSorenessCheckInPrompts({
      today: '2026-07-31',
      sessions: [
        session('older', '2026-07-29T10:00:00'),
        session('newer', '2026-07-30T10:00:00'),
      ],
      logs: [
        log('older', 'old-chest'),
        log('newer', 'bench'),
        log('newer', 'fly'),
        log('newer', 'curl'),
      ],
      slots: [
        slot('old-chest', 'Incline press', 'Chest'),
        slot('bench', 'Bench press', ' Chest '),
        slot('fly', 'Cable fly', 'chest'),
        slot('curl', 'Barbell curl', 'Biceps'),
      ],
      reportedMuscleKeys: [' BICEPS '],
    })

    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toMatchObject({
      sourceSessionId: 'newer',
      muscleKey: 'chest',
      daysAfter: 1,
      exerciseNames: ['Bench press', 'Cable fly'],
    })
  })

  it('does not prompt from readiness-only rows or slots without a muscle', () => {
    const prompts = buildSorenessCheckInPrompts({
      today: '2026-07-31',
      sessions: [session('session', '2026-07-30T10:00:00')],
      logs: [
        {
          session_id: 'session',
          slot_id: 'readiness-only',
          actual_sets: null,
          best_reps: null,
        },
        log('session', 'no-muscle'),
      ],
      slots: [
        slot('readiness-only', 'Bench press', 'Chest'),
        slot('no-muscle', 'Mystery lift', null),
      ],
    })

    expect(prompts).toEqual([])
  })
})

describe('soreness helpers', () => {
  it('normalizes muscle keys and carries the worst delayed response into the engine', () => {
    expect(normalizeMuscleKey('  Upper   Chest ')).toBe('upper chest')
    expect(mergeSorenessRating(3, [6, 4])).toBe(6)
    expect(mergeSorenessRating(null, [7])).toBe(7)
    expect(mergeSorenessRating(5, [])).toBe(5)
  })
})
