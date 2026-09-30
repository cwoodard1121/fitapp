import type { SupabaseClient } from '@supabase/supabase-js'

import {
  calculateHabitStreak,
  countRecentCompletions,
  recentCompletionStrip,
  type RecentDay,
} from '@/lib/habits/streak'
import type { Habit, HabitCompletion, HabitKind } from '@/lib/types'

const RECENT_WINDOW_DAYS = 7

export interface DailyHabitSummary {
  id: string
  name: string
  completedToday: boolean
  currentStreak: number
  bestStreak: number
  totalCompletions: number
  /** Optional "N times a week" target. Null = plain daily streak, no goal shown. */
  goalPerWeek: number | null
  /** build = did the thing, break = avoided the thing. Labeling only. */
  kind: HabitKind
  /** Completions within the trailing 7-day window ending today. */
  completionsThisWeek: number
  /** Last 7 days (oldest first, ending today) for the backfill strip. */
  recentDays: RecentDay[]
}

const COMPLETION_PAGE_SIZE = 1000

/** Keep an app deploy usable while its additive migration is still rolling out. */
function isMissingHabitSchema(error: { code?: string; message?: string }): boolean {
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    Boolean(error.message?.includes("Could not find the table 'public.habits'"))
  )
}

/** Read active habits and derive streaks from immutable completion dates. */
export async function getDailyHabitSummaries(
  supabase: SupabaseClient,
  userId: string,
  today: string,
): Promise<DailyHabitSummary[]> {
  const { data: habitRows, error: habitError } = await supabase
    .from('habits')
    .select('*')
    .eq('user_id', userId)
    .is('archived_at', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (habitError) {
    if (isMissingHabitSchema(habitError)) return []
    throw habitError
  }

  const habits = (habitRows ?? []) as Habit[]
  if (habits.length === 0) return []

  const habitIds = habits.map((habit) => habit.id)
  const completions: Pick<HabitCompletion, 'habit_id' | 'completed_on'>[] = []
  for (let offset = 0; ; offset += COMPLETION_PAGE_SIZE) {
    const { data: completionRows, error: completionError } = await supabase
      .from('habit_completions')
      .select('habit_id,completed_on')
      .eq('user_id', userId)
      .in('habit_id', habitIds)
      .lte('completed_on', today)
      .order('completed_on', { ascending: true })
      .order('habit_id', { ascending: true })
      .range(offset, offset + COMPLETION_PAGE_SIZE - 1)

    if (completionError) {
      if (isMissingHabitSchema(completionError)) return []
      throw completionError
    }

    const page = (completionRows ?? []) as Pick<
      HabitCompletion,
      'habit_id' | 'completed_on'
    >[]
    completions.push(...page)
    if (page.length < COMPLETION_PAGE_SIZE) break
  }

  const datesByHabit = new Map<string, string[]>()
  for (const completion of completions) {
    const dates = datesByHabit.get(completion.habit_id) ?? []
    dates.push(completion.completed_on)
    datesByHabit.set(completion.habit_id, dates)
  }

  return habits.map((habit) => {
    const dates = datesByHabit.get(habit.id) ?? []
    return {
      id: habit.id,
      name: habit.name,
      ...calculateHabitStreak(dates, today),
      goalPerWeek: habit.goal_per_week,
      kind: habit.kind,
      completionsThisWeek: countRecentCompletions(dates, today, RECENT_WINDOW_DAYS),
      recentDays: recentCompletionStrip(dates, today, RECENT_WINDOW_DAYS),
    }
  })
}
