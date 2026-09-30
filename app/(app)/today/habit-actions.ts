'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireUserId } from '@/lib/data'
import { appCalendarDate } from '@/lib/data/soreness'
import { createClient } from '@/lib/supabase/server'
import type { Habit } from '@/lib/types'

const habitKindField = z.enum(['build', 'break']).optional()

const ROUTE = '/today'
const MAX_ACTIVE_HABITS = 20

type ActionResult = { ok: true } | { ok: false; error: string }

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

const goalPerWeekField = z
  .union([z.number().int().min(1, 'Goal must be 1-7 times a week.').max(7, 'Goal must be 1-7 times a week.'), z.null()])
  .optional()

const createSchema = z.object({
  name: z.string().trim().min(1, 'Name the habit.').max(60, 'Keep the name under 60 characters.'),
  goalPerWeek: goalPerWeekField,
  kind: habitKindField,
})

const completionSchema = z.object({
  habitId: z.string().uuid(),
  completed: z.boolean(),
  /** Defaults to today. Any other date backfills a day you forgot to mark live. */
  date: z.string().regex(DATE_ONLY, 'That date did not look right.').optional(),
})

const archiveSchema = z.object({
  habitId: z.string().uuid(),
  archived: z.boolean(),
})

const resetSchema = z.object({
  habitId: z.string().uuid(),
  name: z.string().trim().min(1, 'Name the habit.').max(60, 'Keep the name under 60 characters.').optional(),
  goalPerWeek: goalPerWeekField,
  kind: habitKindField,
})

function actionError(error: unknown, fallback: string): ActionResult {
  const candidate = error as { code?: string; message?: string }
  if (candidate.code === '23505') {
    return { ok: false, error: 'You already have an active habit with that name.' }
  }
  if (candidate.code === '42P01' || candidate.code === 'PGRST205') {
    return { ok: false, error: 'Habit storage is not available yet.' }
  }
  return { ok: false, error: candidate.message ?? fallback }
}

export async function createDailyHabit(
  input: z.input<typeof createSchema>,
): Promise<ActionResult> {
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the habit name.' }
  }

  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)
    const today = appCalendarDate(new Date())

    const { count, error: countError } = await supabase
      .from('habits')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('archived_at', null)
    if (countError) throw countError
    if ((count ?? 0) >= MAX_ACTIVE_HABITS) {
      return { ok: false, error: `Archive one of your ${MAX_ACTIVE_HABITS} habits first.` }
    }

    const { error } = await supabase.from('habits').insert({
      user_id: userId,
      name: parsed.data.name,
      started_on: today,
      sort_order: count ?? 0,
      goal_per_week: parsed.data.goalPerWeek ?? null,
      kind: parsed.data.kind ?? 'build',
    })
    if (error) throw error

    revalidatePath(ROUTE)
    return { ok: true }
  } catch (error) {
    return actionError(error, 'Could not add that habit.')
  }
}

export async function setHabitCompleted(
  input: z.input<typeof completionSchema>,
): Promise<ActionResult> {
  const parsed = completionSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That habit did not look right.' }

  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)
    const today = appCalendarDate(new Date())
    const targetDate = parsed.data.date ?? today

    const { data, error: habitError } = await supabase
      .from('habits')
      .select('id,started_on,archived_at')
      .eq('id', parsed.data.habitId)
      .eq('user_id', userId)
      .maybeSingle()
    if (habitError) throw habitError

    const habit = data as Pick<Habit, 'id' | 'started_on' | 'archived_at'> | null
    if (!habit || habit.archived_at != null || habit.started_on > today) {
      return { ok: false, error: 'That habit is not active.' }
    }
    // Backfill is for days you actually forgot to mark — bounded to the
    // habit's own lifetime, same as today's own gate above.
    if (targetDate > today || targetDate < habit.started_on) {
      return { ok: false, error: 'That date is outside the habit’s active range.' }
    }

    if (parsed.data.completed) {
      const { error } = await supabase.from('habit_completions').upsert(
        {
          habit_id: habit.id,
          user_id: userId,
          completed_on: targetDate,
        },
        {
          onConflict: 'habit_id,completed_on',
          // Completion rows are immutable. A repeated click is a no-op and
          // must not require UPDATE privileges or an UPDATE RLS policy.
          ignoreDuplicates: true,
        },
      )
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('habit_completions')
        .delete()
        .eq('habit_id', habit.id)
        .eq('user_id', userId)
        .eq('completed_on', targetDate)
      if (error) throw error
    }

    revalidatePath(ROUTE)
    return { ok: true }
  } catch (error) {
    return actionError(error, 'Could not update that habit.')
  }
}

export async function resetHabit(
  input: z.input<typeof resetSchema>,
): Promise<ActionResult> {
  const parsed = resetSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check that habit.' }
  }

  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)

    const { error: deleteError } = await supabase
      .from('habit_completions')
      .delete()
      .eq('habit_id', parsed.data.habitId)
      .eq('user_id', userId)
    if (deleteError) throw deleteError

    if (
      parsed.data.name !== undefined ||
      parsed.data.goalPerWeek !== undefined ||
      parsed.data.kind !== undefined
    ) {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (parsed.data.name !== undefined) patch.name = parsed.data.name
      if (parsed.data.goalPerWeek !== undefined) patch.goal_per_week = parsed.data.goalPerWeek
      if (parsed.data.kind !== undefined) patch.kind = parsed.data.kind
      const { error: updateError } = await supabase
        .from('habits')
        .update(patch)
        .eq('id', parsed.data.habitId)
        .eq('user_id', userId)
      if (updateError) throw updateError
    }

    revalidatePath(ROUTE)
    return { ok: true }
  } catch (error) {
    return actionError(error, 'Could not reset that habit.')
  }
}

export async function setHabitArchived(
  input: z.input<typeof archiveSchema>,
): Promise<ActionResult> {
  const parsed = archiveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That habit did not look right.' }

  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('habits')
      .update({
        archived_at: parsed.data.archived ? now : null,
        updated_at: now,
      })
      .eq('id', parsed.data.habitId)
      .eq('user_id', userId)
    if (error) throw error

    revalidatePath(ROUTE)
    return { ok: true }
  } catch (error) {
    return actionError(error, 'Could not update that habit.')
  }
}
