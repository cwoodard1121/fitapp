'use server'

/**
 * Server actions for the program editor. Every mutation:
 *   1. validates its input (zod),
 *   2. writes via the server Supabase client, scoped to the authed user
 *      (user_id is stamped on inserts; RLS enforces it server-side too),
 *   3. revalidates /program so any server-rendered data refreshes.
 *
 * Actions that create rows RETURN the created row so the client can splice the
 * real id into its local state without waiting for a refetch (instant feel).
 */

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import {
  requireUserId,
  createProgram,
  setActiveProgram,
  deleteProgram,
} from '@/lib/data'
import type { ExerciseSlot, Program, ProgramDay } from '@/lib/types'

const ROUTE = '/program'

/** Routes whose server-rendered data depends on which program is active. */
const ACTIVE_PROGRAM_ROUTES = ['/program', '/today', '/mesocycle', '/progress']
function revalidateActiveProgram() {
  for (const r of ACTIVE_PROGRAM_ROUTES) revalidatePath(r)
}

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string }

function fail(error: unknown): { ok: false; error: string } {
  const message =
    error instanceof z.ZodError
      ? (error.issues[0]?.message ?? 'Invalid input.')
      : error instanceof Error
        ? error.message
        : 'Something went wrong.'
  return { ok: false, error: message }
}

async function ctx(): Promise<{ supabase: SupabaseClient; userId: string }> {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)
  return { supabase, userId }
}

/* ------------------------------------------------------------------ */
/* Program meta                                                        */
/* ------------------------------------------------------------------ */

const renameSchema = z.object({
  programId: z.string().uuid(),
  name: z.string().trim().min(1, 'Name your program.').max(80),
})

export async function renameProgram(
  input: z.input<typeof renameSchema>,
): Promise<ActionResult> {
  try {
    const { programId, name } = renameSchema.parse(input)
    const { supabase, userId } = await ctx()
    const { error } = await supabase
      .from('programs')
      .update({ name })
      .eq('id', programId)
      .eq('user_id', userId)
    if (error) throw error
    revalidatePath(ROUTE)
    return { ok: true, data: null }
  } catch (e) {
    return fail(e)
  }
}

const metaSchema = z.object({
  programId: z.string().uuid(),
  lengthWeeks: z.coerce.number().int().min(1, 'At least one week.').max(52),
  deloadWeek: z.coerce.number().int().min(1, 'Deload week must be ≥ 1.').max(52),
  /** When true, mirror deload_week onto the profile so /today agrees. */
  syncProfile: z.boolean().optional().default(true),
})

export async function updateProgramMeta(
  input: z.input<typeof metaSchema>,
): Promise<ActionResult> {
  try {
    const { programId, lengthWeeks, deloadWeek, syncProfile } =
      metaSchema.parse(input)
    if (deloadWeek > lengthWeeks) {
      return { ok: false, error: 'Deload week can’t exceed the program length.' }
    }
    const { supabase, userId } = await ctx()

    const { error } = await supabase
      .from('programs')
      .update({ length_weeks: lengthWeeks, deload_week: deloadWeek })
      .eq('id', programId)
      .eq('user_id', userId)
    if (error) throw error

    // Keep the profile's deload_week in sync so the Today/engine view agrees.
    if (syncProfile) {
      const { error: pErr } = await supabase
        .from('profiles')
        .update({ deload_week: deloadWeek })
        .eq('id', userId)
      if (pErr) throw pErr
    }

    revalidatePath(ROUTE)
    return { ok: true, data: null }
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------------------------------------------ */
/* Program management — create / activate / delete                     */
/* ------------------------------------------------------------------ */

const createProgramSchema = z.object({
  name: z.string().trim().min(1, 'Name your program.').max(80),
  template: z.enum(['blank', 'starter']).default('blank'),
})

/**
 * Create a new (inactive) program — blank or a copy of the starter template.
 * Returns the new program so the client can navigate straight to editing it.
 */
export async function createProgramAction(
  input: z.input<typeof createProgramSchema>,
): Promise<ActionResult<Program>> {
  try {
    const { name, template } = createProgramSchema.parse(input)
    const program = await createProgram({ name, template })
    revalidateActiveProgram()
    return { ok: true, data: program }
  } catch (e) {
    return fail(e)
  }
}

const programIdSchema = z.object({ programId: z.string().uuid() })

/** Make a program the user's single active program (atomic switch). */
export async function setActiveProgramAction(
  input: z.input<typeof programIdSchema>,
): Promise<ActionResult> {
  try {
    const { programId } = programIdSchema.parse(input)
    await setActiveProgram(programId)
    revalidateActiveProgram()
    return { ok: true, data: null }
  } catch (e) {
    return fail(e)
  }
}

/**
 * Delete a program (days, slots, sessions and logs cascade). If it was active
 * and others remain, the most recent remaining program becomes active.
 */
export async function deleteProgramAction(
  input: z.input<typeof programIdSchema>,
): Promise<ActionResult<{ newActiveId: string | null }>> {
  try {
    const { programId } = programIdSchema.parse(input)
    const res = await deleteProgram(programId)
    revalidateActiveProgram()
    return { ok: true, data: res }
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------------------------------------------ */
/* Days                                                                */
/* ------------------------------------------------------------------ */

const addDaySchema = z.object({ programId: z.string().uuid() })

export async function addDay(
  input: z.input<typeof addDaySchema>,
): Promise<ActionResult<ProgramDay>> {
  try {
    const { programId } = addDaySchema.parse(input)
    const { supabase, userId } = await ctx()

    const { data: existing, error: qErr } = await supabase
      .from('program_days')
      .select('day_number')
      .eq('program_id', programId)
      .eq('user_id', userId)
      .order('day_number', { ascending: false })
      .limit(1)
    if (qErr) throw qErr

    const nextNumber = ((existing?.[0]?.day_number as number | undefined) ?? 0) + 1

    const { data, error } = await supabase
      .from('program_days')
      .insert({
        program_id: programId,
        user_id: userId,
        day_number: nextNumber,
        label: `Day ${nextNumber}`,
      })
      .select('*')
      .single()
    if (error) throw error

    revalidatePath(ROUTE)
    return { ok: true, data: data as ProgramDay }
  } catch (e) {
    return fail(e)
  }
}

const updateDaySchema = z.object({
  dayId: z.string().uuid(),
  label: z.string().trim().min(1, 'Give the day a label.').max(80),
  dayNumber: z.coerce.number().int().min(1).max(14),
})

export async function updateDay(
  input: z.input<typeof updateDaySchema>,
): Promise<ActionResult> {
  try {
    const { dayId, label, dayNumber } = updateDaySchema.parse(input)
    const { supabase, userId } = await ctx()
    const { error } = await supabase
      .from('program_days')
      .update({ label, day_number: dayNumber })
      .eq('id', dayId)
      .eq('user_id', userId)
    if (error) throw error
    revalidatePath(ROUTE)
    return { ok: true, data: null }
  } catch (e) {
    return fail(e)
  }
}

const removeDaySchema = z.object({ dayId: z.string().uuid() })

export async function removeDay(
  input: z.input<typeof removeDaySchema>,
): Promise<ActionResult> {
  try {
    const { dayId } = removeDaySchema.parse(input)
    const { supabase, userId } = await ctx()
    // exercise_slots (and any sessions) cascade on the FK; delete the day.
    const { error } = await supabase
      .from('program_days')
      .delete()
      .eq('id', dayId)
      .eq('user_id', userId)
    if (error) throw error
    revalidatePath(ROUTE)
    return { ok: true, data: null }
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------------------------------------------ */
/* Slots                                                               */
/* ------------------------------------------------------------------ */

const addSlotSchema = z.object({ dayId: z.string().uuid() })

export async function addSlot(
  input: z.input<typeof addSlotSchema>,
): Promise<ActionResult<ExerciseSlot>> {
  try {
    const { dayId } = addSlotSchema.parse(input)
    const { supabase, userId } = await ctx()

    // Need the day number for a readable slot_code, plus the current slots to
    // compute the next order_index / sequence letter.
    const { data: day, error: dErr } = await supabase
      .from('program_days')
      .select('day_number')
      .eq('id', dayId)
      .eq('user_id', userId)
      .single()
    if (dErr) throw dErr

    const { data: slots, error: sErr } = await supabase
      .from('exercise_slots')
      .select('order_index')
      .eq('day_id', dayId)
      .eq('user_id', userId)
      .gte('order_index', 0)
      .order('order_index', { ascending: false })
      .limit(1)
    if (sErr) throw sErr

    const count = await supabase
      .from('exercise_slots')
      .select('id', { count: 'exact', head: true })
      .eq('day_id', dayId)
      .eq('user_id', userId)

    const seq = (count.count ?? 0) + 1
    const nextOrder = ((slots?.[0]?.order_index as number | undefined) ?? -1) + 1
    const dayNumber = (day as { day_number: number }).day_number

    const { data, error } = await supabase
      .from('exercise_slots')
      .insert({
        day_id: dayId,
        user_id: userId,
        slot_code: `D${dayNumber}A${seq}`,
        order_index: nextOrder,
        exercise_name: 'New exercise',
        muscle_area: null,
        progress_bias: 'Reps first',
        rep_low: 8,
        rep_high: 12,
        target_rir: 3,
        base_sets: 3,
        load_increment: 5,
        seed_load: null,
      })
      .select('*')
      .single()
    if (error) throw error

    revalidatePath(ROUTE)
    return { ok: true, data: data as ExerciseSlot }
  } catch (e) {
    return fail(e)
  }
}

const updateSlotSchema = z
  .object({
    slotId: z.string().uuid(),
    slotCode: z.string().trim().min(1, 'Slot code is required.').max(16),
    orderIndex: z.coerce.number().int().min(0),
    exerciseName: z.string().trim().min(1, 'Name the exercise.').max(80),
    muscleArea: z
      .string()
      .trim()
      .max(40)
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null))
      .nullable(),
    progressBias: z.enum(['Load +5', 'Reps first', 'Set optional']),
    repLow: z.coerce.number().int().min(1, 'Reps must be ≥ 1.').max(100),
    repHigh: z.coerce.number().int().min(1, 'Reps must be ≥ 1.').max(100),
    targetRir: z.coerce.number().min(0).max(10),
    baseSets: z.coerce.number().int().min(1, 'At least one set.').max(20),
    loadIncrement: z.coerce.number().min(0.1, 'Increment must be > 0.').max(100),
    seedLoad: z
      .union([z.coerce.number().min(0).max(2000), z.null()])
      .optional()
      .transform((v) => (v === undefined ? null : v)),
    isBodyweight: z.boolean().optional().default(false),
  })
  .refine((v) => v.repHigh >= v.repLow, {
    message: 'Top of the rep range must be ≥ the bottom.',
    path: ['repHigh'],
  })

export async function updateSlot(
  input: z.input<typeof updateSlotSchema>,
): Promise<ActionResult> {
  try {
    const v = updateSlotSchema.parse(input)
    const { supabase, userId } = await ctx()
    const { error } = await supabase
      .from('exercise_slots')
      .update({
        slot_code: v.slotCode,
        order_index: v.orderIndex,
        exercise_name: v.exerciseName,
        muscle_area: v.muscleArea ?? null,
        progress_bias: v.progressBias,
        rep_low: v.repLow,
        rep_high: v.repHigh,
        target_rir: v.targetRir,
        base_sets: v.baseSets,
        load_increment: v.loadIncrement,
        seed_load: v.seedLoad,
        is_bodyweight: v.isBodyweight,
      })
      .eq('id', v.slotId)
      .eq('user_id', userId)
    if (error) throw error
    revalidatePath(ROUTE)
    return { ok: true, data: null }
  } catch (e) {
    return fail(e)
  }
}

const removeSlotSchema = z.object({ slotId: z.string().uuid() })

export async function removeSlot(
  input: z.input<typeof removeSlotSchema>,
): Promise<ActionResult> {
  try {
    const { slotId } = removeSlotSchema.parse(input)
    const { supabase, userId } = await ctx()
    const { error } = await supabase
      .from('exercise_slots')
      .delete()
      .eq('id', slotId)
      .eq('user_id', userId)
    if (error) throw error
    revalidatePath(ROUTE)
    return { ok: true, data: null }
  } catch (e) {
    return fail(e)
  }
}

const reorderSchema = z.object({
  dayId: z.string().uuid(),
  slotId: z.string().uuid(),
  direction: z.enum(['up', 'down']),
})

/**
 * Move a slot up or down within its day by swapping order_index with its
 * neighbour. Robust against gaps in the sequence — it sorts the live rows and
 * swaps the two adjacent values. No-op (still ok) at the ends.
 */
export async function reorderSlot(
  input: z.input<typeof reorderSchema>,
): Promise<ActionResult> {
  try {
    const { dayId, slotId, direction } = reorderSchema.parse(input)
    const { supabase, userId } = await ctx()

    const { data: rows, error } = await supabase
      .from('exercise_slots')
      .select('id, order_index')
      .eq('day_id', dayId)
      .eq('user_id', userId)
      .gte('order_index', 0)
      .order('order_index', { ascending: true })
    if (error) throw error

    const list = (rows ?? []) as { id: string; order_index: number }[]
    const idx = list.findIndex((r) => r.id === slotId)
    if (idx === -1) return { ok: false, error: 'Slot not found.' }

    const swapWith = direction === 'up' ? idx - 1 : idx + 1
    if (swapWith < 0 || swapWith >= list.length) {
      return { ok: true, data: null } // already at the end — nothing to do
    }

    const a = list[idx]
    const b = list[swapWith]

    const r1 = await supabase
      .from('exercise_slots')
      .update({ order_index: b.order_index })
      .eq('id', a.id)
      .eq('user_id', userId)
    if (r1.error) throw r1.error

    const r2 = await supabase
      .from('exercise_slots')
      .update({ order_index: a.order_index })
      .eq('id', b.id)
      .eq('user_id', userId)
    if (r2.error) throw r2.error

    revalidatePath(ROUTE)
    return { ok: true, data: null }
  } catch (e) {
    return fail(e)
  }
}
