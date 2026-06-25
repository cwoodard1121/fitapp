import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProgramDay } from '@/lib/types'
import type { SeedDay } from '@/lib/seed/program'

/**
 * Insert a list of program days (and each day's exercise slots) under an
 * existing program. Shared by the default-program seeder and the
 * "create program from a template" flow so the row mapping (including
 * is_bodyweight) lives in exactly one place. No imports from programs.ts/seed.ts
 * so it can be used by both without a module cycle.
 */
export async function insertDaysAndSlots(
  supabase: SupabaseClient,
  userId: string,
  programId: string,
  days: SeedDay[],
): Promise<void> {
  for (const day of days) {
    const { data: dayRow, error: dErr } = await supabase
      .from('program_days')
      .insert({
        program_id: programId,
        user_id: userId,
        day_number: day.dayNumber,
        label: day.label,
      })
      .select('*')
      .single()
    if (dErr) throw dErr
    const dayId = (dayRow as ProgramDay).id

    if (day.slots.length === 0) continue

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
      is_bodyweight: s.isBodyweight ?? false,
    }))

    const { error: sErr } = await supabase.from('exercise_slots').insert(slotRows)
    if (sErr) throw sErr
  }
}
