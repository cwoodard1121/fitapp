import { describe, expect, it } from 'vitest'

import type { ExerciseSlot, Goal, SetLog } from '@/lib/types'

import { computeAnalytics } from './compute'

const slot: ExerciseSlot = {
  id: 'bench-slot',
  day_id: 'day-1',
  user_id: 'user',
  slot_code: 'bench',
  order_index: 0,
  exercise_name: 'Barbell Bench Press',
  muscle_area: 'Chest',
  progress_bias: 'Load +5',
  rep_low: 5,
  rep_high: 10,
  target_rir: 2,
  base_sets: 2,
  load_increment: 5,
  seed_load: 100,
  is_bodyweight: false,
}

const volumeGoal: Goal = {
  id: 'volume-goal',
  user_id: 'user',
  title: 'Weekly volume',
  metric_type: 'volume',
  exercise_name: null,
  start_value: 1_000,
  target_value: 5_000,
  target_unit: 'lb',
  target_date: null,
  status: 'active',
  notes: null,
  created_at: '2026-01-01T00:00:00.000Z',
}

interface LogOptions {
  id: string
  performedAt: string
  createdAt: string
  mesocycle: number
  sets: number
  reps?: number
  load?: number
  scheduleVersion?: string
}

function log({
  id,
  performedAt,
  createdAt,
  mesocycle,
  sets,
  reps = 10,
  load = 100,
  scheduleVersion = 'schedule-1',
}: LogOptions): SetLog {
  return {
    id,
    user_id: 'user',
    session_id: `session-${id}`,
    slot_id: slot.id,
    week: 1,
    actual_load: load,
    best_reps: reps,
    actual_sets: sets,
    actual_rir: 2,
    target_load: load,
    target_sets: sets,
    target_reps: reps,
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
    session_performed_at: performedAt,
    session_created_at: createdAt,
    session_mesocycle: mesocycle,
    session_schedule_version: scheduleVersion,
    session_program_id: 'program',
  }
}

function analytics(logs: SetLog[], now: string) {
  return computeAnalytics({
    now: new Date(now),
    program: null,
    slots: [slot],
    logs,
    goals: [volumeGoal],
    bodyMetrics: [],
    nutrition: [],
    dietBlock: null,
  })
}

describe('training-week analytics chronology', () => {
  it('keeps repeated Week 1 cycles separate for volume totals and pacing', () => {
    const result = analytics(
      [
        log({
          id: 'cycle-0-week-1',
          performedAt: '2026-01-01T12:00:00.000Z',
          createdAt: '2026-01-01T13:00:00.000Z',
          mesocycle: 0,
          sets: 2,
        }),
        log({
          id: 'cycle-1-week-1',
          performedAt: '2026-01-08T12:00:00.000Z',
          createdAt: '2026-01-08T13:00:00.000Z',
          mesocycle: 1,
          sets: 3,
        }),
      ],
      '2026-01-09T12:00:00.000Z',
    )

    expect(result.volume).toEqual([
      { muscle: 'Chest', weeklySets: 3, weeklyTonnage: 3_000 },
    ])
    expect(result.goals[0].actualWeeklyRate).toBe(1_000)
  })

  it('uses workout time when a past session is logged retroactively', () => {
    const result = analytics(
      [
        log({
          id: 'backfilled-old-workout',
          performedAt: '2026-01-01T12:00:00.000Z',
          createdAt: '2026-02-20T12:00:00.000Z',
          mesocycle: 0,
          sets: 1,
        }),
        log({
          id: 'recent-workout',
          performedAt: '2026-02-19T12:00:00.000Z',
          createdAt: '2026-02-01T12:00:00.000Z',
          mesocycle: 1,
          sets: 2,
          reps: 12,
        }),
      ],
      '2026-02-21T12:00:00.000Z',
    )

    expect(result.volume).toEqual([
      { muscle: 'Chest', weeklySets: 2, weeklyTonnage: 2_400 },
    ])
    expect(result.goals[0].current).toBe(2_400)
  })

  it('keeps the latest week with actual work when a newer week has only feedback', () => {
    const completed = log({
      id: 'completed-workout',
      performedAt: '2026-02-19T12:00:00.000Z',
      createdAt: '2026-02-19T13:00:00.000Z',
      mesocycle: 1,
      sets: 3,
    })
    const feedbackOnly: SetLog = {
      ...log({
        id: 'feedback-only',
        performedAt: '2026-02-20T12:00:00.000Z',
        createdAt: '2026-02-20T13:00:00.000Z',
        mesocycle: 2,
        sets: 1,
      }),
      actual_load: null,
      best_reps: null,
      actual_sets: null,
      recovery: 4,
    }

    const result = analytics(
      [completed, feedbackOnly],
      '2026-02-21T12:00:00.000Z',
    )

    expect(result.volume).toEqual([
      { muscle: 'Chest', weeklySets: 3, weeklyTonnage: 3_000 },
    ])
  })

  it('keeps the newest supplied feedback when a later field is left blank', () => {
    const earlier = {
      ...log({
        id: 'feedback-earlier',
        performedAt: '2026-02-18T12:00:00.000Z',
        createdAt: '2026-02-18T13:00:00.000Z',
        mesocycle: 1,
        sets: 2,
      }),
      pump: 8,
      pain: 1,
      next_day_soreness: 3,
      performance: 'Up' as const,
    }
    const later = log({
      id: 'feedback-later',
      performedAt: '2026-02-20T12:00:00.000Z',
      createdAt: '2026-02-20T13:00:00.000Z',
      mesocycle: 1,
      sets: 2,
    })

    const lift = analytics(
      [earlier, later],
      '2026-02-21T12:00:00.000Z',
    ).lifts[0]

    expect(lift.latestPump).toBe(8)
    expect(lift.latestPain).toBe(1)
    expect(lift.latestNextDaySoreness).toBe(3)
    expect(lift.latestPerformance).toBe('Up')
  })
})
