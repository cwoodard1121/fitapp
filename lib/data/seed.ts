import type { Program } from '@/lib/types'
import { createClient } from '@/lib/supabase/server'
import { requireUserId } from '@/lib/data/auth'
import { getActiveProgram } from '@/lib/data/programs'
import { DEFAULT_PROGRAM } from '@/lib/seed/program'
import { insertDaysAndSlots } from '@/lib/data/program-write'

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

  // Idempotency guard #2: a program exists but NONE is active (e.g. a failed
  // delete re-home left every row inactive). Self-heal by activating the most
  // recently created one rather than returning an inactive program.
  const { data: anyProgram, error: anyErr } = await supabase
    .from('programs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (anyErr) throw anyErr
  if (anyProgram) {
    const programRow = anyProgram as Program
    const { error: rpcErr } = await supabase.rpc('set_active_program', {
      p_program_id: programRow.id,
    })
    if (rpcErr) throw rpcErr
    return (await getActiveProgram()) ?? { ...programRow, is_active: true }
  }

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

  await insertDaysAndSlots(supabase, userId, programRow.id, DEFAULT_PROGRAM.days)

  return programRow
}
