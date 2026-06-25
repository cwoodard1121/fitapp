'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { seedDefaultProgram, setProgramStartDate } from '@/lib/data'

const startDateSchema = z.object({
  programId: z.string().uuid(),
  // Accept an empty string (clear the date) or a YYYY-MM-DD calendar date.
  startDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid date.')
    .or(z.literal('')),
})

export type ActionResult = { ok: true } | { ok: false; error: string }

/**
 * Set (or clear) the start date for a program — each program owns its own
 * mesocycle anchor, so this drives the current-week math whenever that program
 * is active. A null start_date means "unset / Week 1" for that program.
 */
export async function setStartDate(input: {
  programId: string
  startDate: string
}): Promise<ActionResult> {
  const parsed = startDateSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid date.' }
  }
  const date = parsed.data.startDate === '' ? null : parsed.data.startDate

  try {
    await setProgramStartDate(parsed.data.programId, date)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not save.' }
  }

  revalidatePath('/mesocycle')
  revalidatePath('/today')
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
