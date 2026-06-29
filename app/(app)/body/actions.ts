'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { requireUserId } from '@/lib/data'
import type { BodyMetric } from '@/lib/types'

export type ActionResult =
  | { ok: true; metric: BodyMetric }
  | { ok: false; error: string }

const ROUTE = '/body'

/** yyyy-MM-dd */
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid date.')

const upsertSchema = z.object({
  measured_on: dateSchema,
  // Bodyweight is required for a weigh-in; keep a sane upper bound.
  bodyweight: z
    .number({ invalid_type_error: 'Enter your weight.' })
    .positive('Weight must be greater than zero.')
    .max(2000, "That weight doesn't look right."),
  bodyfat_pct: z
    .number()
    .min(1, 'Body fat must be at least 1%.')
    .max(75, 'Body fat must be under 75%.')
    .nullable()
    .optional(),
  notes: z.string().trim().max(500, 'Keep notes under 500 characters.').nullable().optional(),
})

export type UpsertBodyMetricInput = z.input<typeof upsertSchema>

/**
 * Add or update a weigh-in. Upserts on (user_id, measured_on) so logging
 * twice in one day overwrites rather than duplicates.
 */
export async function upsertBodyMetric(
  input: UpsertBodyMetricInput,
): Promise<ActionResult> {
  const parsed = upsertSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid entry.' }
  }
  const { measured_on, bodyweight, bodyfat_pct, notes } = parsed.data

  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)

    const { data, error } = await supabase
      .from('body_metrics')
      .upsert(
        {
          user_id: userId,
          measured_on,
          bodyweight,
          bodyfat_pct: bodyfat_pct ?? null,
          notes: notes && notes.length > 0 ? notes : null,
          // A manual weigh-in always wins over the wearable sync.
          source: 'manual',
        },
        { onConflict: 'user_id,measured_on' },
      )
      .select('*')
      .single()

    if (error) return { ok: false, error: error.message }
    revalidatePath(ROUTE)
    return { ok: true, metric: data as BodyMetric }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not save the weigh-in.',
    }
  }
}

/** Delete a weigh-in by id (RLS scopes this to the current user). */
export async function deleteBodyMetric(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: 'Missing entry.' }
  try {
    const supabase = await createClient()
    await requireUserId(supabase)

    const { error } = await supabase.from('body_metrics').delete().eq('id', id)
    if (error) return { ok: false, error: error.message }
    revalidatePath(ROUTE)
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not delete the weigh-in.',
    }
  }
}
