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
import {
  getPendingSorenessCheckIns,
  requireUserId,
  seedDefaultProgram,
} from '@/lib/data'
import { appCalendarDate } from '@/lib/data/soreness'

const ROUTE = '/today'

const nullableRating = z.union([z.number().finite().min(1).max(10), z.null()])
const nullableLoad = z.union([z.number().finite().min(0).max(2000), z.null()])
const nullableSets = z.union([z.number().int().min(1).max(30), z.null()])
const nullableReps = z.union([z.number().int().min(1).max(100), z.null()])
const nullableRir = z.union([z.number().finite().min(0).max(10), z.null()])
const nullablePain = z.union([z.number().int().min(0).max(10), z.null()])
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
  targetLoad: nullableLoad,
  targetSets: nullableSets,
  targetReps: nullableReps,
  targetRir: nullableRir,
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

  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)

    // The RPC owns the replacement transaction, relationship checks, aggregate
    // cache, and target snapshot. No partial delete/insert state can escape.
    const { error } = await supabase.rpc('save_training_set_entries_atomic', {
      p_session_id: v.sessionId,
      p_slot_id: v.slotId,
      p_week: v.week,
      p_entries: v.entries,
      p_target_load: v.targetLoad,
      p_target_sets: v.targetSets,
      p_target_reps: v.targetReps,
      p_target_rir: v.targetRir,
    })
    if (error) throw error

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

    const { error } = await supabase.rpc('save_training_session_readiness', {
      p_session_id: v.sessionId,
      p_week: v.week,
      p_recovery: v.recovery,
    })
    if (error) throw error

    await bumpSessionInProgress(supabase, userId, v.sessionId)

    revalidatePath(ROUTE)
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not save your readiness. Try again.' }
  }
}

/* ------------------------------------------------------------------ */
/* Exercise feedback — per-exercise: pump / pain / performance /       */
/* Pain is immediate; next-day soreness is stored separately by muscle. */
/* ------------------------------------------------------------------ */

const readinessSchema = z.object({
  sessionId: z.string().uuid(),
  slotId: z.string().uuid(),
  week: z.number().int().positive(),
  pump: nullableRating,
  pain: nullablePain,
  enjoyment: nullableRating,
  performance: performanceSchema,
  hitRirOverride: rirOverrideSchema,
  notes: z.string().max(2000).nullable(),
  targetLoad: nullableLoad,
  targetSets: nullableSets,
  targetReps: nullableReps,
  targetRir: nullableRir,
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

    const { error } = await supabase.rpc('save_training_exercise_feedback', {
      p_session_id: v.sessionId,
      p_slot_id: v.slotId,
      p_week: v.week,
      p_pump: v.pump,
      p_pain: v.pain,
      p_enjoyment: v.enjoyment,
      p_performance: v.performance,
      p_hit_rir_override: v.hitRirOverride,
      p_notes: v.notes,
      p_target_load: v.targetLoad,
      p_target_sets: v.targetSets,
      p_target_reps: v.targetReps,
      p_target_rir: v.targetRir,
    })
    if (error) throw error

    await bumpSessionInProgress(supabase, userId, v.sessionId)

    revalidatePath(ROUTE)
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not save your readiness. Try again.' }
  }
}

/* ------------------------------------------------------------------ */
/* Delayed soreness — one check-in per trained muscle on days 1 and 2 */
/* ------------------------------------------------------------------ */

const sorenessCheckInsSchema = z.object({
  reports: z
    .array(
      z.object({
        sourceSessionId: z.string().uuid(),
        muscleKey: z.string().trim().min(1).max(100),
        soreness: z.number().int().min(0).max(10),
      }),
    )
    .min(1)
    .max(30),
})

export type SorenessCheckInsInput = z.infer<typeof sorenessCheckInsSchema>

export async function saveSorenessCheckIns(
  input: SorenessCheckInsInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = sorenessCheckInsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Those soreness ratings did not look right.' }
  }

  const uniqueKeys = new Set(parsed.data.reports.map((report) => report.muscleKey))
  if (uniqueKeys.size !== parsed.data.reports.length) {
    return { ok: false, error: 'Each muscle can only be reported once a day.' }
  }

  try {
    const today = appCalendarDate(new Date())
    // Recompute eligibility on the server. Client-provided session and muscle
    // identifiers are accepted only when they exactly match a pending prompt.
    const eligible = await getPendingSorenessCheckIns()
    const eligibleByKey = new Map(eligible.map((prompt) => [prompt.muscleKey, prompt]))

    const rows = parsed.data.reports.map((report) => {
      const prompt = eligibleByKey.get(report.muscleKey)
      if (!prompt || prompt.sourceSessionId !== report.sourceSessionId) {
        throw new Error('Soreness report is not eligible')
      }
      return { report, prompt }
    })

    const supabase = await createClient()
    const userId = await requireUserId(supabase)
    const { error } = await supabase.from('muscle_soreness_checkins').insert(
      rows.map(({ report, prompt }) => ({
        user_id: userId,
        session_id: prompt.sourceSessionId,
        muscle_area: prompt.muscleArea,
        checked_on: today,
        soreness: report.soreness,
      })),
    )
    if (error) throw error

    revalidatePath(ROUTE)
    revalidatePath('/progress')
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not save today\'s soreness. Try again.' }
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
/* Remembered training week — sticks across visits until changed again */
/* or explicitly cleared via "Back to current".                        */
/* ------------------------------------------------------------------ */

const lastSelectedWeekSchema = z.object({
  week: z.number().int().min(1).max(52).nullable(),
})

/**
 * Persist (or clear) the athlete's manually-picked training week so the next
 * visit with no explicit ?week= reopens on it instead of snapping back to the
 * calendar-derived current week. Fire-and-forget from the client — never
 * blocks navigation, so a failure here is silent (the URL param still works).
 */
export async function setLastSelectedWeek(
  input: z.infer<typeof lastSelectedWeekSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = lastSelectedWeekSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Unknown week.' }

  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)
    const { error } = await supabase
      .from('profiles')
      .update({ last_selected_week: parsed.data.week })
      .eq('id', userId)
    if (error) throw error
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not remember that week.' }
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
