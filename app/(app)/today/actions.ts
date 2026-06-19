'use server'

/**
 * Server actions for the Today / session logger.
 *
 * Every mutation: validate input (zod) -> write via the server Supabase client
 * (RLS + an explicit user_id stamp scope it to the caller) -> revalidate the
 * route so the engine readout recomputes live.
 */

import { z } from 'zod'
import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'
import { requireUserId, seedDefaultProgram } from '@/lib/data'

const ROUTE = '/today'

const nullableNumber = z.union([z.number().finite(), z.null()])
const performanceSchema = z.enum(['Up', 'Same', 'Down']).nullable()
const rirOverrideSchema = z.enum(['Y', 'N', 'Skip']).nullable()

/* ------------------------------------------------------------------ */
/* Numeric set entry — load / reps / sets / RIR                        */
/* ------------------------------------------------------------------ */

const setEntrySchema = z.object({
  sessionId: z.string().uuid(),
  slotId: z.string().uuid(),
  week: z.number().int().positive(),
  actualLoad: nullableNumber,
  bestReps: nullableNumber,
  actualSets: nullableNumber,
  actualRir: nullableNumber,
})

export type SetEntryInput = z.infer<typeof setEntrySchema>

export async function saveSetEntry(
  input: SetEntryInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = setEntrySchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Those numbers did not look right.' }
  }
  const v = parsed.data

  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)

    // Upsert only the numeric columns — readiness columns are left untouched on
    // conflict so logging a set never wipes a saved readiness rating.
    const { error } = await supabase.from('set_logs').upsert(
      {
        user_id: userId,
        session_id: v.sessionId,
        slot_id: v.slotId,
        week: v.week,
        actual_load: v.actualLoad,
        best_reps: v.bestReps,
        actual_sets: v.actualSets,
        actual_rir: v.actualRir,
      },
      { onConflict: 'session_id,slot_id' },
    )
    if (error) throw error

    await bumpSessionInProgress(supabase, userId, v.sessionId)

    revalidatePath(ROUTE)
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not save that set. Try again.' }
  }
}

/* ------------------------------------------------------------------ */
/* Readiness — pump / soreness / recovery / enjoyment / perf / notes   */
/* ------------------------------------------------------------------ */

const readinessSchema = z.object({
  sessionId: z.string().uuid(),
  slotId: z.string().uuid(),
  week: z.number().int().positive(),
  pump: nullableNumber,
  soreness: nullableNumber,
  recovery: nullableNumber,
  enjoyment: nullableNumber,
  performance: performanceSchema,
  hitRirOverride: rirOverrideSchema,
  notes: z.string().max(2000).nullable(),
  /** Apply the systemic ratings (recovery + performance) to every slot. */
  applyToAll: z.boolean(),
  allSlotIds: z.array(z.string().uuid()),
})

export type ReadinessInput = z.infer<typeof readinessSchema>

export async function saveReadiness(
  input: ReadinessInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = readinessSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Those ratings did not look right.' }
  }
  const v = parsed.data

  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)

    // This slot gets the full readiness set (pump + soreness are exercise-specific).
    const { error } = await supabase.from('set_logs').upsert(
      {
        user_id: userId,
        session_id: v.sessionId,
        slot_id: v.slotId,
        week: v.week,
        pump: v.pump,
        soreness: v.soreness,
        recovery: v.recovery,
        enjoyment: v.enjoyment,
        performance: v.performance,
        hit_rir_override: v.hitRirOverride,
        notes: v.notes,
      },
      { onConflict: 'session_id,slot_id' },
    )
    if (error) throw error

    // Recovery + performance are systemic — optionally fan them out to the rest.
    if (v.applyToAll) {
      const others = v.allSlotIds
        .filter((id) => id !== v.slotId)
        .map((id) => ({
          user_id: userId,
          session_id: v.sessionId,
          slot_id: id,
          week: v.week,
          recovery: v.recovery,
          performance: v.performance,
        }))
      if (others.length > 0) {
        const { error: fanErr } = await supabase
          .from('set_logs')
          .upsert(others, { onConflict: 'session_id,slot_id' })
        if (fanErr) throw fanErr
      }
    }

    await bumpSessionInProgress(supabase, userId, v.sessionId)

    revalidatePath(ROUTE)
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not save your readiness. Try again.' }
  }
}

/* ------------------------------------------------------------------ */
/* Session lifecycle                                                   */
/* ------------------------------------------------------------------ */

const sessionIdSchema = z.object({ sessionId: z.string().uuid() })

export async function finishSession(
  input: z.infer<typeof sessionIdSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = sessionIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Unknown session.' }

  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)
    const { error } = await supabase
      .from('sessions')
      .update({ status: 'done', performed_at: new Date().toISOString() })
      .eq('id', parsed.data.sessionId)
      .eq('user_id', userId)
    if (error) throw error
    revalidatePath(ROUTE)
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not finish the session. Try again.' }
  }
}

export async function reopenSession(
  input: z.infer<typeof sessionIdSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = sessionIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Unknown session.' }

  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)
    const { error } = await supabase
      .from('sessions')
      .update({ status: 'in_progress', performed_at: null })
      .eq('id', parsed.data.sessionId)
      .eq('user_id', userId)
    if (error) throw error
    revalidatePath(ROUTE)
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not reopen the session. Try again.' }
  }
}

/* ------------------------------------------------------------------ */
/* Empty-state convenience: seed the starter program                   */
/* ------------------------------------------------------------------ */

export async function seedStarterProgram(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    await seedDefaultProgram()
    revalidatePath(ROUTE)
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not create the starter program.' }
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Move a freshly-touched 'planned' session to 'in_progress'. Best-effort. */
async function bumpSessionInProgress(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  sessionId: string,
): Promise<void> {
  await supabase
    .from('sessions')
    .update({ status: 'in_progress' })
    .eq('id', sessionId)
    .eq('user_id', userId)
    .eq('status', 'planned')
}
