'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { requireUserId, seedDefaultProgram } from '@/lib/data'

const startDateSchema = z.object({
  // Accept an empty string (clear the date) or a YYYY-MM-DD calendar date.
  startDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid date.')
    .or(z.literal('')),
})

export type ActionResult = { ok: true } | { ok: false; error: string }

/**
 * Set (or clear) the program start date that drives the current-week math.
 * Writes profiles.start_date for the authenticated user.
 */
export async function setStartDate(input: {
  startDate: string
}): Promise<ActionResult> {
  const parsed = startDateSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid date.' }
  }

  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)

    const { error } = await supabase
      .from('profiles')
      .update({ start_date: parsed.data.startDate === '' ? null : parsed.data.startDate })
      .eq('id', userId)
    if (error) return { ok: false, error: error.message }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not save.' }
  }

  revalidatePath('/mesocycle')
  return { ok: true }
}

/**
 * Seed the default program when the user has none yet. Idempotent.
 */
export async function seedProgram(): Promise<ActionResult> {
  try {
    await seedDefaultProgram()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not seed program.' }
  }
  revalidatePath('/mesocycle')
  return { ok: true }
}
