'use server'

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'
import { requireUserId, seedDefaultProgram } from '@/lib/data'
import { DEFAULT_WEIGHTS, type ReadinessWeights } from '@/lib/engine/engine'

export type ActionResult = { ok: true } | { ok: false; error: string }

/* ------------------------------------------------------------------ */
/* Profile + mesocycle                                                 */
/* ------------------------------------------------------------------ */

export interface ProfileInput {
  display_name: string | null
  unit: 'lb' | 'kg'
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
    const deload_week = clampInt(input.deload_week, 0, 52, 0)

    const { error } = await supabase
      .from('profiles')
      .update({ display_name, unit, deload_week })
      .eq('id', userId)

    if (error) return { ok: false, error: error.message }

    revalidatePath('/settings')
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
/* Reset account — wipe all of the user's data back to a fresh start   */
/* ------------------------------------------------------------------ */

// Child tables before parents so the wipe is complete even if an ON DELETE
// cascade is ever misconfigured. Deleting `programs` already cascades
// program_days/exercise_slots/sessions/set_logs/set_entries, but we clear them
// explicitly too. blocks.program_id is ON DELETE SET NULL, so blocks are
// removed on their own. Profiles is intentionally NOT deleted (1:1 with the
// auth user) — it is reset to defaults below.
const USER_TABLES = [
  'set_entries',
  'set_logs',
  'sessions',
  'exercise_slots',
  'program_days',
  'programs',
  'blocks',
  'goals',
  'body_metrics',
  'nutrition_logs',
  'ai_analyses',
] as const

export async function resetAccount(): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)

    for (const table of USER_TABLES) {
      const { error } = await supabase.from(table).delete().eq('user_id', userId)
      if (error) {
        return { ok: false, error: `Could not clear ${table}: ${error.message}` }
      }
    }

    // Reset the profile to the column defaults from 0001_init.sql.
    const { error: profileErr } = await supabase
      .from('profiles')
      .update({
        display_name: null,
        unit: 'lb',
        start_date: null,
        deload_week: 5,
        readiness_weights: null,
        maintenance_calories: null,
      })
      .eq('id', userId)
    if (profileErr) return { ok: false, error: profileErr.message }

    // Re-seed the default program so the user lands on a working setup, exactly
    // like a brand-new account.
    await seedDefaultProgram()

    // Everything changed — revalidate every route under the root layout.
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Could not reset your account.',
    }
  }
}
