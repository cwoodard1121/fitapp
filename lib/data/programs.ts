import type { ExerciseSlot, Program, ProgramDay, ProgramFull } from '@/lib/types'
import { createClient } from '@/lib/supabase/server'
import { requireUserId } from '@/lib/data/auth'
import { DEFAULT_PROGRAM } from '@/lib/seed/program'
import { insertDaysAndSlots } from '@/lib/data/program-write'

/**
 * The user's active program, or null if none exists yet.
 */
export async function getActiveProgram(): Promise<Program | null> {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)
  const { data, error } = await supabase
    .from('programs')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .is('archived_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as Program | null) ?? null
}

/**
 * Every program the user owns, active first then newest. Powers the program
 * switcher — the user can OWN many but only one is active at a time.
 */
export async function getPrograms(): Promise<Program[]> {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)
  const { data, error } = await supabase
    .from('programs')
    .select('*')
    .eq('user_id', userId)
    .is('archived_at', null)
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as Program[]) ?? []
}

/**
 * Create a new (inactive) program for the user — blank (one empty day) or a copy
 * of the starter template. Creating does NOT switch the active program; the user
 * activates it deliberately. Returns the new program row.
 */
export async function createProgram(input: {
  name: string
  template: 'blank' | 'starter'
}): Promise<Program> {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)

  const name = input.name.trim() || 'New program'
  const lengthWeeks =
    input.template === 'starter' ? DEFAULT_PROGRAM.lengthWeeks : 5
  const deloadWeek =
    input.template === 'starter' ? DEFAULT_PROGRAM.deloadWeek : 5

  const { data: program, error: pErr } = await supabase
    .from('programs')
    .insert({
      user_id: userId,
      name,
      length_weeks: lengthWeeks,
      deload_week: deloadWeek,
      is_active: false,
    })
    .select('*')
    .single()
  if (pErr) throw pErr
  const programRow = program as Program

  if (input.template === 'starter') {
    await insertDaysAndSlots(supabase, userId, programRow.id, DEFAULT_PROGRAM.days)
  } else {
    await insertDaysAndSlots(supabase, userId, programRow.id, [
      { dayNumber: 1, label: 'Day 1', slots: [] },
    ])
  }

  return programRow
}

/**
 * Duplicate a program's structure (days + exercise slots) into a new,
 * inactive program the user can tweak or run later. Logged history (sessions,
 * set logs) never copies — this is a fresh structural clone, not a branch of
 * the original's training log. Named "<original> (copy)" so it's obvious at a
 * glance; the user can rename it via renameProgram afterward.
 */
export async function duplicateProgram(programId: string): Promise<Program> {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)

  const { data: source, error: sErr } = await supabase
    .from('programs')
    .select('*')
    .eq('id', programId)
    .eq('user_id', userId)
    .maybeSingle()
  if (sErr) throw sErr
  if (!source) throw new Error('That program no longer exists.')
  const sourceProgram = source as Program

  const { data: days, error: dErr } = await supabase
    .from('program_days')
    .select('*')
    .eq('program_id', programId)
    .eq('user_id', userId)
    .order('day_number', { ascending: true })
  if (dErr) throw dErr
  const sourceDays = (days as ProgramDay[]) ?? []

  const dayIds = sourceDays.map((d) => d.id)
  let sourceSlots: ExerciseSlot[] = []
  if (dayIds.length > 0) {
    const { data: slotRows, error: slErr } = await supabase
      .from('exercise_slots')
      .select('*')
      .in('day_id', dayIds)
      .eq('user_id', userId)
      .order('order_index', { ascending: true })
    if (slErr) throw slErr
    sourceSlots = (slotRows as ExerciseSlot[]) ?? []
  }

  const { data: created, error: pErr } = await supabase
    .from('programs')
    .insert({
      user_id: userId,
      name: `${sourceProgram.name} (copy)`,
      length_weeks: sourceProgram.length_weeks,
      deload_week: sourceProgram.deload_week,
      is_active: false,
    })
    .select('*')
    .single()
  if (pErr) throw pErr
  const newProgram = created as Program

  const slotsByDay = new Map<string, ExerciseSlot[]>()
  for (const slot of sourceSlots) {
    const list = slotsByDay.get(slot.day_id) ?? []
    list.push(slot)
    slotsByDay.set(slot.day_id, list)
  }

  await insertDaysAndSlots(
    supabase,
    userId,
    newProgram.id,
    sourceDays.map((day) => ({
      dayNumber: day.day_number,
      label: day.label,
      slots: (slotsByDay.get(day.id) ?? []).map((slot) => ({
        slotCode: slot.slot_code,
        orderIndex: slot.order_index,
        exerciseName: slot.exercise_name,
        muscleArea: slot.muscle_area,
        progressBias: slot.progress_bias,
        repLow: slot.rep_low,
        repHigh: slot.rep_high,
        targetRir: slot.target_rir,
        baseSets: slot.base_sets,
        loadIncrement: slot.load_increment,
        seedLoad: slot.seed_load,
        isBodyweight: slot.is_bodyweight,
      })),
    })),
  )

  return newProgram
}

/**
 * Make `programId` the user's single active program (atomic via the DB
 * function: deactivate all, then activate the target). Validates ownership
 * first so a bad id can't leave the user with no active program.
 */
export async function setActiveProgram(programId: string): Promise<void> {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)

  const { data: owned, error: oErr } = await supabase
    .from('programs')
    .select('id')
    .eq('id', programId)
    .eq('user_id', userId)
    .is('archived_at', null)
    .maybeSingle()
  if (oErr) throw oErr
  if (!owned) throw new Error('Program not found.')

  const { error } = await supabase.rpc('set_active_program', {
    p_program_id: programId,
  })
  if (error) throw error
}

/**
 * Delete a program (its days, slots, sessions and logs cascade). If the deleted
 * program was active and others remain, the most recent remaining program is
 * activated so the user always has an active program when possible. Returns the
 * id that became active, or null.
 */
export async function deleteProgram(
  programId: string,
): Promise<{ newActiveId: string | null }> {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)

  const { data: target, error: tErr } = await supabase
    .from('programs')
    .select('id, is_active')
    .eq('id', programId)
    .eq('user_id', userId)
    .is('archived_at', null)
    .maybeSingle()
  if (tErr) throw tErr
  if (!target) throw new Error('Program not found.')
  const wasActive = (target as Pick<Program, 'is_active'>).is_active

  const { error: dErr } = await supabase
    .from('programs')
    .delete()
    .eq('id', programId)
    .eq('user_id', userId)
  if (dErr) throw dErr

  if (!wasActive) return { newActiveId: null }

  // Re-home: activate the most recently created remaining program, if any.
  const { data: next, error: nErr } = await supabase
    .from('programs')
    .select('id')
    .eq('user_id', userId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (nErr) throw nErr
  const nextId = (next as Pick<Program, 'id'> | null)?.id ?? null
  if (nextId) {
    const { error } = await supabase.rpc('set_active_program', {
      p_program_id: nextId,
    })
    if (error) throw error
  }
  return { newActiveId: nextId }
}

/**
 * Set a program's mesocycle start date (null clears it). Scoped to the user.
 */
export async function setProgramStartDate(
  programId: string,
  startDate: string | null,
): Promise<void> {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)
  const { error } = await supabase
    .from('programs')
    .update({ start_date: startDate })
    .eq('id', programId)
    .eq('user_id', userId)
  if (error) throw error
}

/**
 * Full program tree: program + days (ordered by day_number) + active slots
 * (ordered by order_index). A negative order_index retires a slot from the
 * current routine without deleting its historical logs.
 */
export async function getProgramFull(programId: string): Promise<ProgramFull | null> {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)

  const { data: program, error: pErr } = await supabase
    .from('programs')
    .select('*')
    .eq('id', programId)
    .eq('user_id', userId)
    .maybeSingle()
  if (pErr) throw pErr
  if (!program) return null

  const { data: days, error: dErr } = await supabase
    .from('program_days')
    .select('*')
    .eq('program_id', programId)
    .eq('user_id', userId)
    .order('day_number', { ascending: true })
  if (dErr) throw dErr

  const dayIds = (days as ProgramDay[]).map((d) => d.id)
  let slots: ExerciseSlot[] = []
  if (dayIds.length > 0) {
    const { data: slotRows, error: sErr } = await supabase
      .from('exercise_slots')
      .select('*')
      .in('day_id', dayIds)
      .eq('user_id', userId)
      .gte('order_index', 0)
      .order('order_index', { ascending: true })
    if (sErr) throw sErr
    slots = slotRows as ExerciseSlot[]
  }

  return {
    program: program as Program,
    days: days as ProgramDay[],
    slots,
  }
}

/**
 * All slots for a given day, ordered by order_index.
 */
export async function getSlotsForDay(dayId: string): Promise<ExerciseSlot[]> {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)
  const { data, error } = await supabase
    .from('exercise_slots')
    .select('*')
    .eq('day_id', dayId)
    .eq('user_id', userId)
    .gte('order_index', 0)
    .order('order_index', { ascending: true })
  if (error) throw error
  return data as ExerciseSlot[]
}
