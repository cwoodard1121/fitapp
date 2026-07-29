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
import { aggregateFromEntries } from '@/lib/data/mappers'
import { appCalendarDate } from '@/lib/data/soreness'

const ROUTE = '/today'

const nullableRating = z.union([z.number().finite().min(1).max(10), z.null()])
const nullableLoad = z.union([z.number().finite().min(0).max(2000), z.null()])
const nullableReps = z.union([z.number().int().min(1).max(100), z.null()])
const nullableRir = z.union([z.number().finite().min(0).max(10), z.null()])
const performanceSchema = z.enum(['Up', 'Same', 'Down']).nullable()
const rirOverrideSchema = z.enum(['Y', 'N', 'Skip']).nullable()

/* ------------------------------------------------------------------ */
/* Per-set logging — each set has its own load / reps / RIR            */
/* ------------------------------------------------------------------ */

const setRowSchema = z.object({
  load: nullableLoad,
  reps: nullableReps,
  rir: nullableRir,
})

const setEntriesSchema = z.object({
  sessionId: z.string().uuid(),
  slotId: z.string().uuid(),
  week: z.number().int().positive(),
  entries: z.array(setRowSchema).max(30),
})

export type SetEntriesInput = z.infer<typeof setEntriesSchema>

/**
 * Replace the slot's set list and recompute the aggregate cache on set_logs
 * (load/reps/sets/RIR) that the engine, history and progress read. Readiness
 * columns on set_logs are left untouched.
 */
export async function saveSetEntries(
  input: SetEntriesInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = setEntriesSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Those sets did not look right.' }
  }
  const v = parsed.data
  // A performed set has reps (load alone = a prefilled row not yet done).
  // Renumber 1..n in order.
  const real = v.entries.filter((e) => e.reps != null)

  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)

    // Replace strategy: clear this slot's sets, then insert the current list.
    const { error: delErr } = await supabase
      .from('set_entries')
      .delete()
      .eq('user_id', userId)
      .eq('session_id', v.sessionId)
      .eq('slot_id', v.slotId)
    if (delErr) throw delErr

    if (real.length > 0) {
      const rows = real.map((e, i) => ({
        user_id: userId,
        session_id: v.sessionId,
        slot_id: v.slotId,
        set_number: i + 1,
        load: e.load,
        reps: e.reps,
        rir: e.rir,
      }))
      const { error: insErr } = await supabase.from('set_entries').insert(rows)
      if (insErr) throw insErr
    }

    // Recompute the aggregate cache the engine reads (don't touch readiness).
    const agg = aggregateFromEntries(real)
    const { error: aggErr } = await supabase.from('set_logs').upsert(
      {
        user_id: userId,
        session_id: v.sessionId,
        slot_id: v.slotId,
        week: v.week,
        actual_load: agg.actual_load,
        best_reps: agg.best_reps,
        actual_sets: agg.actual_sets,
        actual_rir: agg.actual_rir,
      },
      { onConflict: 'session_id,slot_id' },
    )
    if (aggErr) throw aggErr

    await bumpSessionInProgress(supabase, userId, v.sessionId)

    revalidatePath(ROUTE)
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not save those sets. Try again.' }
  }
}

/* ------------------------------------------------------------------ */
/* Session readiness — INCOMING systemic fatigue/recovery.              */
/* One value for the whole session (genuinely systemic). Soreness is    */
/* NOT here — it is muscle-specific and lives per exercise.             */
/* ------------------------------------------------------------------ */

const sessionReadinessSchema = z.object({
  sessionId: z.string().uuid(),
  week: z.number().int().positive(),
  recovery: nullableRating,
  allSlotIds: z.array(z.string().uuid()).min(1),
})

export type SessionReadinessInput = z.infer<typeof sessionReadinessSchema>

export async function saveSessionReadiness(
  input: SessionReadinessInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = sessionReadinessSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'That rating did not look right.' }
  }
  const v = parsed.data

  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)

    // Systemic recovery is the same for the whole session, so it goes onto every
    // exercise of the day. Upserting just this column preserves each slot's sets,
    // soreness, and outcome ratings.
    const rows = v.allSlotIds.map((id) => ({
      user_id: userId,
      session_id: v.sessionId,
      slot_id: id,
      week: v.week,
      recovery: v.recovery,
    }))
    const { error } = await supabase
      .from('set_logs')
      .upsert(rows, { onConflict: 'session_id,slot_id' })
    if (error) throw error

    await bumpSessionInProgress(supabase, userId, v.sessionId)

    revalidatePath(ROUTE)
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not save your readiness. Try again.' }
  }
}

/* ------------------------------------------------------------------ */
/* Exercise readiness — per-exercise: pump / soreness / performance /  */
/* enjoyment / notes. Soreness is muscle-specific, so it lives here.   */
/* ------------------------------------------------------------------ */

const readinessSchema = z.object({
  sessionId: z.string().uuid(),
  slotId: z.string().uuid(),
  week: z.number().int().positive(),
  pump: nullableRating,
  soreness: nullableRating,
  enjoyment: nullableRating,
  performance: performanceSchema,
  hitRirOverride: rirOverrideSchema,
  notes: z.string().max(2000).nullable(),
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

    // Per-exercise outcome ratings. Upserting just these columns preserves the
    // slot's sets and the session-level recovery/soreness.
    const { error } = await supabase.from('set_logs').upsert(
      {
        user_id: userId,
        session_id: v.sessionId,
        slot_id: v.slotId,
        week: v.week,
        pump: v.pump,
        soreness: v.soreness,
        enjoyment: v.enjoyment,
        performance: v.performance,
        hit_rir_override: v.hitRirOverride,
        notes: v.notes,
      },
      { onConflict: 'session_id,slot_id' },
    )
    if (error) throw error

    await bumpSessionInProgress(supabase, userId, v.sessionId)

    revalidatePath(ROUTE)
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not save your readiness. Try again.' }
  }
}

/* ------------------------------------------------------------------ */
/* Next-day soreness — one rating per muscle trained in a done session */
/* ------------------------------------------------------------------ */

function normalizeMuscleArea(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

const sorenessCheckinSchema = z.object({
  sessionId: z.string().uuid(),
  muscles: z
    .array(
      z.object({
        muscleArea: z.string().trim().min(1).max(40),
        soreness: z.number().int().min(0).max(10),
      }),
    )
    .min(1)
    .max(20)
    .refine(
      (rows) =>
        new Set(rows.map((row) => normalizeMuscleArea(row.muscleArea))).size ===
        rows.length,
      'Each muscle area can only be rated once.',
    ),
})

export type SorenessCheckinInput = z.infer<typeof sorenessCheckinSchema>

export async function saveSorenessCheckin(
  input: SorenessCheckinInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = sorenessCheckinSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Those soreness ratings did not look right.' }
  }

  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)
    const { sessionId, muscles } = parsed.data

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id,status')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .maybeSingle()
    if (sessionError) throw sessionError
    if (!session || session.status !== 'done') {
      return { ok: false, error: 'That completed session could not be found.' }
    }

    const { data: logs, error: logError } = await supabase
      .from('set_logs')
      .select('slot_id,actual_load,best_reps,actual_sets,actual_rir')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
    if (logError) throw logError

    const workedSlotIds = (logs ?? [])
      .filter(
        (log) =>
          log.actual_load != null ||
          log.best_reps != null ||
          log.actual_sets != null ||
          log.actual_rir != null,
      )
      .map((log) => log.slot_id as string)
    if (workedSlotIds.length === 0) {
      return { ok: false, error: 'That session has no logged work to rate.' }
    }

    const { data: slots, error: slotError } = await supabase
      .from('exercise_slots')
      .select('muscle_area')
      .eq('user_id', userId)
      .in('id', workedSlotIds)
    if (slotError) throw slotError

    const canonicalMuscles = new Map<string, string>()
    for (const slot of slots ?? []) {
      if (typeof slot.muscle_area !== 'string') continue
      const canonical = slot.muscle_area.trim().replace(/\s+/g, ' ')
      canonicalMuscles.set(normalizeMuscleArea(canonical), canonical)
    }
    const canonicalRows = muscles.map((muscle) => ({
      muscleArea: canonicalMuscles.get(
        normalizeMuscleArea(muscle.muscleArea),
      ),
      soreness: muscle.soreness,
    }))
    if (canonicalRows.some((muscle) => muscle.muscleArea == null)) {
      return {
        ok: false,
        error: 'One of those muscles was not logged in that session.',
      }
    }

    const now = new Date().toISOString()
    const rows = canonicalRows.map((muscle) => ({
      user_id: userId,
      session_id: sessionId,
      muscle_area: muscle.muscleArea!,
      soreness: muscle.soreness,
      checked_on: appCalendarDate(now),
      updated_at: now,
    }))
    const { error } = await supabase
      .from('muscle_soreness_checkins')
      .upsert(rows, { onConflict: 'session_id,muscle_area' })
    if (error) throw error

    revalidatePath('/today')
    revalidatePath('/progress')
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not save soreness. Try again.' }
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
