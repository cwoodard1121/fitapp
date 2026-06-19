import type { ExerciseSlot, Program, ProgramDay, ProgramFull } from '@/lib/types'
import { createClient } from '@/lib/supabase/server'
import { requireUserId } from '@/lib/data/auth'

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
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as Program | null) ?? null
}

/**
 * Full program tree: program + days (ordered by day_number) + slots
 * (ordered by order_index). One query per level, scoped to the user.
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
    .order('order_index', { ascending: true })
  if (error) throw error
  return data as ExerciseSlot[]
}
