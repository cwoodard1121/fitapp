'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { requireUserId } from '@/lib/data'

const ROUTE = '/nutrition'

type ActionResult = { ok: true } | { ok: false; error: string }

/** Coerce an empty / blank numeric field to null, otherwise a finite number. */
const optionalNumber = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined) return null
    if (typeof v === 'number') return Number.isFinite(v) ? v : null
    const trimmed = v.trim()
    if (trimmed === '') return null
    const n = Number(trimmed)
    return Number.isFinite(n) ? n : null
  })
  .refine((v) => v === null || v >= 0, { message: 'Must be zero or more.' })

const upsertSchema = z.object({
  logged_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid date.'),
  calories: optionalNumber,
  protein: optionalNumber,
  carbs: optionalNumber,
  fat: optionalNumber,
  notes: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => {
      const t = (v ?? '').toString().trim()
      return t === '' ? null : t.slice(0, 500)
    }),
})

export type UpsertNutritionInput = z.input<typeof upsertSchema>

/**
 * Add or update a single day's intake. Upserts on (user_id, logged_on) so the
 * same day is one row — logging twice updates, never duplicates.
 */
export async function upsertNutritionLog(
  input: UpsertNutritionInput
): Promise<ActionResult> {
  const parsed = upsertSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Check the values and try again.',
    }
  }

  const supabase = await createClient()
  let userId: string
  try {
    userId = await requireUserId(supabase)
  } catch {
    return { ok: false, error: 'Your session expired. Sign in again.' }
  }

  const { error } = await supabase
    .from('nutrition_logs')
    .upsert(
      {
        user_id: userId,
        logged_on: parsed.data.logged_on,
        calories: parsed.data.calories,
        protein: parsed.data.protein,
        carbs: parsed.data.carbs,
        fat: parsed.data.fat,
        notes: parsed.data.notes,
      },
      { onConflict: 'user_id,logged_on' }
    )

  if (error) {
    return { ok: false, error: error.message }
  }

  revalidatePath(ROUTE)
  return { ok: true }
}

const deleteSchema = z.object({
  logged_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid date.'),
})

export async function deleteNutritionLog(
  input: z.input<typeof deleteSchema>
): Promise<ActionResult> {
  const parsed = deleteSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Could not delete that day.' }
  }

  const supabase = await createClient()
  let userId: string
  try {
    userId = await requireUserId(supabase)
  } catch {
    return { ok: false, error: 'Your session expired. Sign in again.' }
  }

  const { error } = await supabase
    .from('nutrition_logs')
    .delete()
    .eq('user_id', userId)
    .eq('logged_on', parsed.data.logged_on)

  if (error) {
    return { ok: false, error: error.message }
  }

  revalidatePath(ROUTE)
  return { ok: true }
}
