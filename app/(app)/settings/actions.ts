'use server'

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'
import {
  requireUserId,
  seedDefaultProgram,
  createProgram,
  setActiveProgram,
} from '@/lib/data'
import { DEFAULT_PROGRAM } from '@/lib/seed/program'
import { DEFAULT_WEIGHTS, type ReadinessWeights } from '@/lib/engine/engine'

export type ActionResult = { ok: true } | { ok: false; error: string }

/* ------------------------------------------------------------------ */
/* Profile + mesocycle                                                 */
/* ------------------------------------------------------------------ */

export interface ProfileInput {
  display_name: string | null
  unit: 'lb' | 'kg'
  height_cm: number | null
  deload_week: number
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export async function updateProfile(input: ProfileInput): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)

    const display_name = input.display_name?.trim() ? input.display_name.trim() : null
    const unit: 'lb' | 'kg' = input.unit === 'kg' ? 'kg' : 'lb'
    const height_cm =
      input.height_cm == null || input.height_cm === 0
        ? null
        : Number(input.height_cm)
    if (
      height_cm != null &&
      (!Number.isFinite(height_cm) || height_cm < 100 || height_cm > 250)
    ) {
      return { ok: false, error: 'Height must be between 100 and 250 cm.' }
    }
    const deload_week = clampInt(input.deload_week, 0, 52, 0)

    const { error } = await supabase
      .from('profiles')
      .update({ display_name, unit, height_cm, deload_week })
      .eq('id', userId)

    if (error) return { ok: false, error: error.message }

    revalidatePath('/settings')
    revalidatePath('/body')
    revalidatePath('/today')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not save profile.' }
  }
}

/* ------------------------------------------------------------------ */
/* Readiness weights                                                   */
/* ------------------------------------------------------------------ */

const WEIGHT_KEYS = Object.keys(DEFAULT_WEIGHTS) as (keyof ReadinessWeights)[]

function coerceWeights(input: Partial<ReadinessWeights>): ReadinessWeights {
  const out = { ...DEFAULT_WEIGHTS }
  for (const key of WEIGHT_KEYS) {
    const raw = input[key]
    const n = Number(raw)
    if (Number.isFinite(n)) {
      // Keep weights in a sane band and snapped to halves.
      out[key] = Math.min(10, Math.max(-10, Math.round(n * 2) / 2))
    }
  }
  return out
}

export async function updateReadinessWeights(
  input: Partial<ReadinessWeights>
): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)

    const readiness_weights = coerceWeights(input)

    const { error } = await supabase
      .from('profiles')
      .update({ readiness_weights })
      .eq('id', userId)

    if (error) return { ok: false, error: error.message }

    revalidatePath('/settings')
    revalidatePath('/today')
    revalidatePath('/progress')
    revalidatePath('/overview')
    revalidatePath('/history')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not save weights.' }
  }
}

export async function resetReadinessWeights(): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)

    // Null = engine falls back to DEFAULT_WEIGHTS.
    const { error } = await supabase
      .from('profiles')
      .update({ readiness_weights: null })
      .eq('id', userId)

    if (error) return { ok: false, error: error.message }

    revalidatePath('/settings')
    revalidatePath('/today')
    revalidatePath('/progress')
    revalidatePath('/overview')
    revalidatePath('/history')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not reset weights.' }
  }
}

/* ------------------------------------------------------------------ */
/* Reseed default program (escape hatch — idempotent)                  */
/* ------------------------------------------------------------------ */

export async function reseedDefaultProgram(): Promise<ActionResult> {
  try {
    await seedDefaultProgram()
    revalidatePath('/settings')
    revalidatePath('/program')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not seed program.' }
  }
}

/* ------------------------------------------------------------------ */
/* Set program to default (non-destructive — keeps ALL history)        */
/* ------------------------------------------------------------------ */

export async function resetToDefaultProgram(): Promise<ActionResult> {
  try {
    // Create a brand-new copy of the current built-in program and make it the
    // active one. This NEVER touches sessions, set logs, set entries, body
    // metrics, goals, nutrition or blocks — all history is preserved, and the
    // previous program stays available in the program switcher.
    const program = await createProgram({
      name: DEFAULT_PROGRAM.name,
      template: 'starter',
    })
    await setActiveProgram(program.id)
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : 'Could not set your program to the default.',
    }
  }
}
