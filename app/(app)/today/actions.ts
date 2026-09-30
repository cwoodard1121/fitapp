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
  getProfile,
  getSetLogsForSession,
  requireUserId,
  seedDefaultProgram,
} from '@/lib/data'
import { appCalendarDate } from '@/lib/data/soreness'
import { epley1RM } from '@/lib/engine/engine'
import type { ExerciseSlot, ProgramDay, Session, SetLog, Unit } from '@/lib/types'

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

/* ------------------------------------------------------------------ */
/* Session Wrapped — a quick celebratory recap right after finishing    */
/* ------------------------------------------------------------------ */

export interface SessionRecapPR {
  exerciseName: string
  e1rm: number
}

export interface SessionRecapData {
  dayLabel: string
  totalTonnage: number
  loggedCount: number
  totalSets: number
  totalReps: number
  unit: Unit
  prs: SessionRecapPR[]
}

type SessionRecapResult =
  | { ok: true; data: SessionRecapData }
  | { ok: false; error: string }

/**
 * A session-scale version of the block "Wrapped" recap — fires every finish,
 * not just once a block completes. Tonnage/e1RM use the exact formulas the
 * engine itself uses (lib/engine/engine.ts) so the numbers match what History
 * shows for this same session. A PR only counts when there's prior history on
 * that exercise to beat — a first-ever log isn't a "record" yet.
 */
export async function getSessionRecap(
  input: z.infer<typeof sessionIdSchema>,
): Promise<SessionRecapResult> {
  const parsed = sessionIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Unknown session.' }

  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)

    const { data: sessionRow, error: sErr } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', parsed.data.sessionId)
      .eq('user_id', userId)
      .maybeSingle()
    if (sErr) throw sErr
    if (!sessionRow) return { ok: false, error: 'Session not found.' }
    const session = sessionRow as Session

    const [{ data: dayRow }, logsBySlot, profile] = await Promise.all([
      supabase
        .from('program_days')
        .select('*')
        .eq('id', session.day_id)
        .eq('user_id', userId)
        .maybeSingle(),
      getSetLogsForSession(session.id),
      getProfile(),
    ])

    const logs = Object.values(logsBySlot)

    let totalTonnage = 0
    let loggedCount = 0
    let totalSets = 0
    let totalReps = 0
    const sessionE1rmBySlot = new Map<string, number>()

    for (const log of logs) {
      const hasData =
        log.actual_load != null || log.best_reps != null || log.actual_sets != null
      if (!hasData) continue
      loggedCount += 1
      if (log.actual_sets != null) totalSets += log.actual_sets
      if (log.actual_sets != null && log.best_reps != null) {
        totalReps += log.actual_sets * log.best_reps
      }
      if (log.actual_sets != null && log.best_reps != null && log.actual_load != null) {
        totalTonnage += log.actual_sets * log.best_reps * log.actual_load
      }
      if (log.actual_load != null && log.best_reps != null) {
        sessionE1rmBySlot.set(log.slot_id, epley1RM(log.actual_load, log.best_reps))
      }
    }

    const prs: SessionRecapPR[] = []
    if (sessionE1rmBySlot.size > 0) {
      const dateIso = session.performed_at ?? session.created_at
      const { data: priorRows, error: pErr } = await supabase
        .from('set_logs')
        .select('slot_id, actual_load, best_reps')
        .in('slot_id', [...sessionE1rmBySlot.keys()])
        .eq('user_id', userId)
        .neq('session_id', session.id)
        .lt('created_at', dateIso)
      if (pErr) throw pErr

      const priorBestBySlot = new Map<string, number>()
      for (const row of (priorRows ?? []) as Pick<
        SetLog,
        'slot_id' | 'actual_load' | 'best_reps'
      >[]) {
        if (row.actual_load == null || row.best_reps == null) continue
        const e1rm = epley1RM(row.actual_load, row.best_reps)
        const prev = priorBestBySlot.get(row.slot_id) ?? 0
        if (e1rm > prev) priorBestBySlot.set(row.slot_id, e1rm)
      }

      const prSlotIds = [...sessionE1rmBySlot.entries()]
        .filter(([slotId, e1rm]) => {
          const prior = priorBestBySlot.get(slotId)
          return prior != null && e1rm > prior
        })
        .map(([slotId]) => slotId)

      if (prSlotIds.length > 0) {
        const { data: slotRows, error: slotErr } = await supabase
          .from('exercise_slots')
          .select('id, exercise_name')
          .in('id', prSlotIds)
          .eq('user_id', userId)
        if (slotErr) throw slotErr
        const nameById = new Map(
          ((slotRows ?? []) as Pick<ExerciseSlot, 'id' | 'exercise_name'>[]).map((s) => [
            s.id,
            s.exercise_name,
          ]),
        )
        for (const slotId of prSlotIds) {
          const name = nameById.get(slotId)
          const e1rm = sessionE1rmBySlot.get(slotId)
          if (name && e1rm != null) {
            prs.push({ exerciseName: name, e1rm: Math.round(e1rm * 10) / 10 })
          }
        }
      }
    }

    const day = dayRow as ProgramDay | null

    return {
      ok: true,
      data: {
        dayLabel: day?.label ?? 'Workout',
        totalTonnage: Math.round(totalTonnage),
        loggedCount,
        totalSets,
        totalReps,
        unit: profile?.unit ?? 'lb',
        prs,
      },
    }
  } catch {
    return { ok: false, error: 'Could not load session recap.' }
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
