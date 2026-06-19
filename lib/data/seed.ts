import type { Program, ProgramDay } from '@/lib/types'
import { createClient } from '@/lib/supabase/server'
import { requireUserId } from '@/lib/data/auth'
import { getActiveProgram } from '@/lib/data/programs'
import { DEFAULT_PROGRAM } from '@/lib/seed/program'

/**
 * Insert the default program (days + slots) for the current user if they don't
 * already have one. Idempotent: if any program exists, it is returned unchanged.
 */
export async function seedDefaultProgram(): Promise<Program> {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)

  // Idempotency guard #1: active program already present.
  const active = await getActiveProgram()
  if (active) return active

  // Idempotency guard #2: any program at all (active or not).
  const { data: anyProgram, error: anyErr } = await supabase
    .from('programs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (anyErr) throw anyErr
  if (anyProgram) return anyProgram as Program

  // Insert program.
  const { data: program, error: pErr } = await supabase
    .from('programs')
    .insert({
      user_id: userId,
      name: DEFAULT_PROGRAM.name,
      length_weeks: DEFAULT_PROGRAM.lengthWeeks,
      deload_week: DEFAULT_PROGRAM.deloadWeek,
      is_active: true,
    })
    .select('*')
    .single()
  if (pErr) throw pErr
  const programRow = program as Program

  // Insert days + their slots.
  for (const day of DEFAULT_PROGRAM.days) {
    const { data: dayRow, error: dErr } = await supabase
      .from('program_days')
      .insert({
        program_id: programRow.id,
        user_id: userId,
        day_number: day.dayNumber,
        label: day.label,
      })
      .select('*')
      .single()
    if (dErr) throw dErr
    const dayId = (dayRow as ProgramDay).id

    const slotRows = day.slots.map((s) => ({
      day_id: dayId,
      user_id: userId,
      slot_code: s.slotCode,
      order_index: s.orderIndex,
      exercise_name: s.exerciseName,
      muscle_area: s.muscleArea,
      progress_bias: s.progressBias,
      rep_low: s.repLow,
      rep_high: s.repHigh,
      target_rir: s.targetRir,
      base_sets: s.baseSets,
      load_increment: s.loadIncrement,
      seed_load: s.seedLoad,
    }))

    const { error: sErr } = await supabase.from('exercise_slots').insert(slotRows)
    if (sErr) throw sErr
  }

  return programRow
}
