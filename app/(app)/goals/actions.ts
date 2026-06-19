'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'
import { requireUserId } from '@/lib/data'
import type { GoalStatus } from '@/lib/types'

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

const ROUTE = '/goals'

const nullableNumber = z
  .union([z.number(), z.null()])
  .refine((v) => v === null || Number.isFinite(v), 'Enter a valid number')

const goalSchema = z
  .object({
    title: z.string().trim().min(1, 'Give the goal a title').max(120),
    metric_type: z.enum(['bodyweight', 'bodyfat', 'e1rm', 'volume', 'custom']),
    exercise_name: z
      .union([z.string(), z.null()])
      .transform((v) => (typeof v === 'string' ? v.trim() : v))
      .transform((v) => (v ? v : null)),
    start_value: nullableNumber,
    target_value: nullableNumber,
    target_unit: z
      .union([z.string(), z.null()])
      .transform((v) => (typeof v === 'string' ? v.trim() : v))
      .transform((v) => (v ? v : null)),
    target_date: z
      .union([z.string(), z.null()])
      .transform((v) => (v ? v : null)),
    status: z.enum(['active', 'achieved', 'abandoned']).default('active'),
    notes: z
      .union([z.string(), z.null()])
      .transform((v) => (typeof v === 'string' ? v.trim() : v))
      .transform((v) => (v ? v : null)),
  })
  .refine(
    (g) => g.metric_type !== 'e1rm' || !!g.exercise_name,
    { message: 'Pick the exercise to track', path: ['exercise_name'] },
  )

export type GoalInput = z.input<typeof goalSchema>
export type ActionResult = { ok: true } | { ok: false; error: string }

function fail(error: string): ActionResult {
  return { ok: false, error }
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

export async function createGoal(input: GoalInput): Promise<ActionResult> {
  const parsed = goalSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Check the goal details')
  }

  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)
    const g = parsed.data

    // e1rm targets only carry an exercise; clear it otherwise.
    const exercise_name = g.metric_type === 'e1rm' ? g.exercise_name : null

    const { error } = await supabase.from('goals').insert({
      user_id: userId,
      title: g.title,
      metric_type: g.metric_type,
      exercise_name,
      start_value: g.start_value,
      target_value: g.target_value,
      target_unit: g.target_unit,
      target_date: g.target_date,
      status: g.status,
      notes: g.notes,
    })
    if (error) return fail(error.message)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not save the goal')
  }

  revalidatePath(ROUTE)
  return { ok: true }
}

export async function updateGoal(
  id: string,
  input: GoalInput,
): Promise<ActionResult> {
  if (!id) return fail('Missing goal id')
  const parsed = goalSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Check the goal details')
  }

  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)
    const g = parsed.data
    const exercise_name = g.metric_type === 'e1rm' ? g.exercise_name : null

    const { error } = await supabase
      .from('goals')
      .update({
        title: g.title,
        metric_type: g.metric_type,
        exercise_name,
        start_value: g.start_value,
        target_value: g.target_value,
        target_unit: g.target_unit,
        target_date: g.target_date,
        status: g.status,
        notes: g.notes,
      })
      .eq('id', id)
      .eq('user_id', userId)
    if (error) return fail(error.message)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not update the goal')
  }

  revalidatePath(ROUTE)
  return { ok: true }
}

export async function setGoalStatus(
  id: string,
  status: GoalStatus,
): Promise<ActionResult> {
  if (!id) return fail('Missing goal id')
  if (!['active', 'achieved', 'abandoned'].includes(status)) {
    return fail('Invalid status')
  }

  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)
    const { error } = await supabase
      .from('goals')
      .update({ status })
      .eq('id', id)
      .eq('user_id', userId)
    if (error) return fail(error.message)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not update the goal')
  }

  revalidatePath(ROUTE)
  return { ok: true }
}

export async function deleteGoal(id: string): Promise<ActionResult> {
  if (!id) return fail('Missing goal id')

  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)
    const { error } = await supabase
      .from('goals')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (error) return fail(error.message)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not delete the goal')
  }

  revalidatePath(ROUTE)
  return { ok: true }
}
