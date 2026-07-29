import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireUserId } from '@/lib/data'
import {
  EXERCISE_CATALOG,
  type CatalogExercise,
} from '@/lib/exercises/catalog'
import {
  exerciseNameKey,
  nextGeneratedSlotCode,
} from '@/lib/exercises/identity'
import { createClient } from '@/lib/supabase/server'
import type { ExerciseSlot, Program, ProgramDay } from '@/lib/types'

export const COACH_PROGRAM_TOOLS = [
  {
    type: 'function',
    name: 'edit_program_exercise',
    description:
      'Replace an exercise and/or change its sets, rep range, or target RIR in the active program. Use only when the athlete explicitly asks to edit their program. Null fields preserve the current value. Replacement exercises must be from the exercise library.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        day_number: {
          type: 'integer',
          minimum: 1,
          maximum: 14,
          description: 'The numbered day in the active program.',
        },
        current_exercise: {
          type: 'string',
          description: 'Exact current exercise name shown on that day.',
        },
        replacement_exercise: {
          type: ['string', 'null'],
          description:
            'Exact exercise-library name to swap in, or null for a prescription-only edit.',
        },
        sets: {
          type: ['integer', 'null'],
          minimum: 1,
          maximum: 20,
          description: 'New work-set count, or null to preserve it.',
        },
        rep_low: {
          type: ['integer', 'null'],
          minimum: 1,
          maximum: 100,
          description: 'New bottom of the rep range, or null to preserve it.',
        },
        rep_high: {
          type: ['integer', 'null'],
          minimum: 1,
          maximum: 100,
          description: 'New top of the rep range, or null to preserve it.',
        },
        target_rir: {
          type: ['number', 'null'],
          minimum: 0,
          maximum: 10,
          description: 'New target reps in reserve, or null to preserve it.',
        },
      },
      required: [
        'day_number',
        'current_exercise',
        'replacement_exercise',
        'sets',
        'rep_low',
        'rep_high',
        'target_rir',
      ],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'add_program_exercise',
    description:
      'Add an exercise-library movement to the end of a day in the active program. Use only when the athlete explicitly asks to add it.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        day_number: {
          type: 'integer',
          minimum: 1,
          maximum: 14,
          description: 'The numbered day in the active program.',
        },
        exercise: {
          type: 'string',
          description: 'Exact exercise-library name to add.',
        },
        sets: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          description: 'Work-set count.',
        },
        rep_low: {
          type: ['integer', 'null'],
          minimum: 1,
          maximum: 100,
          description: 'Bottom of rep range, or null for the library default.',
        },
        rep_high: {
          type: ['integer', 'null'],
          minimum: 1,
          maximum: 100,
          description: 'Top of rep range, or null for the library default.',
        },
        target_rir: {
          type: ['number', 'null'],
          minimum: 0,
          maximum: 10,
          description: 'Target reps in reserve, or null for 3.',
        },
      },
      required: [
        'day_number',
        'exercise',
        'sets',
        'rep_low',
        'rep_high',
        'target_rir',
      ],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'remove_program_exercise',
    description:
      'Remove an exercise from the current routine while preserving all historical sessions and progress. Use only when the athlete explicitly asks to remove it.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        day_number: {
          type: 'integer',
          minimum: 1,
          maximum: 14,
          description: 'The numbered day in the active program.',
        },
        exercise: {
          type: 'string',
          description: 'Exact current exercise name shown on that day.',
        },
      },
      required: ['day_number', 'exercise'],
      additionalProperties: false,
    },
  },
] as const

const editSchema = z
  .object({
    day_number: z.number().int().min(1).max(14),
    current_exercise: z.string().trim().min(1).max(80),
    replacement_exercise: z.string().trim().min(1).max(80).nullable(),
    sets: z.number().int().min(1).max(20).nullable(),
    rep_low: z.number().int().min(1).max(100).nullable(),
    rep_high: z.number().int().min(1).max(100).nullable(),
    target_rir: z.number().min(0).max(10).nullable(),
  })
  .refine(
    (value) =>
      value.replacement_exercise != null ||
      value.sets != null ||
      value.rep_low != null ||
      value.rep_high != null ||
      value.target_rir != null,
    'No program change was requested.',
  )

const addSchema = z.object({
  day_number: z.number().int().min(1).max(14),
  exercise: z.string().trim().min(1).max(80),
  sets: z.number().int().min(1).max(20),
  rep_low: z.number().int().min(1).max(100).nullable(),
  rep_high: z.number().int().min(1).max(100).nullable(),
  target_rir: z.number().min(0).max(10).nullable(),
})

const removeSchema = z.object({
  day_number: z.number().int().min(1).max(14),
  exercise: z.string().trim().min(1).max(80),
})

export interface CoachProgramToolResult {
  ok: boolean
  message: string
}

interface DayState {
  program: Program
  day: ProgramDay
  activeSlots: ExerciseSlot[]
  allSlots: ExerciseSlot[]
}

function normalizedName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
}

function findCatalogExercise(name: string): CatalogExercise | null {
  const exact = EXERCISE_CATALOG.find(
    (exercise) => normalizedName(exercise.name) === normalizedName(name),
  )
  if (exact) return exact

  const key = exerciseNameKey(name)
  return (
    EXERCISE_CATALOG.find(
      (exercise) => exerciseNameKey(exercise.name) === key,
    ) ?? null
  )
}

function findActiveSlot(slots: ExerciseSlot[], name: string): ExerciseSlot {
  const exactMatches = slots.filter(
    (slot) => normalizedName(slot.exercise_name) === normalizedName(name),
  )
  if (exactMatches.length === 1) return exactMatches[0]
  if (exactMatches.length > 1) {
    throw new Error(`"${name}" appears more than once on this day.`)
  }

  const key = exerciseNameKey(name)
  const matches = slots.filter(
    (slot) => exerciseNameKey(slot.exercise_name) === key,
  )
  if (matches.length === 0) {
    throw new Error(
      `"${name}" is not on this day. Current exercises: ${slots
        .map((slot) => slot.exercise_name)
        .join(', ')}.`,
    )
  }
  if (matches.length > 1) {
    throw new Error(`"${name}" appears more than once on this day.`)
  }
  return matches[0]
}

async function loadDayState(dayNumber: number): Promise<DayState> {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)
  const { data: programRow, error: programError } = await supabase
    .from('programs')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()
  if (programError) throw programError
  if (!programRow) throw new Error('There is no active program to edit.')
  const program = programRow as Program

  const { data: dayRow, error: dayError } = await supabase
    .from('program_days')
    .select('*')
    .eq('program_id', program.id)
    .eq('user_id', userId)
    .eq('day_number', dayNumber)
    .maybeSingle()
  if (dayError) throw dayError
  if (!dayRow) throw new Error(`Day ${dayNumber} is not in the active program.`)
  const day = dayRow as ProgramDay

  const { data: slotRows, error: slotError } = await supabase
    .from('exercise_slots')
    .select('*')
    .eq('day_id', day.id)
    .eq('user_id', userId)
    .order('order_index', { ascending: true })
  if (slotError) throw slotError
  const allSlots = (slotRows ?? []) as ExerciseSlot[]

  return {
    program,
    day,
    activeSlots: allSlots.filter((slot) => slot.order_index >= 0),
    allSlots,
  }
}

function validateRepRange(repLow: number, repHigh: number): void {
  if (repHigh < repLow) {
    throw new Error('The top of the rep range must be at least the bottom.')
  }
}

function revalidateProgramSurfaces(): void {
  for (const path of [
    '/program',
    '/today',
    '/mesocycle',
    '/progress',
    '/history',
  ]) {
    revalidatePath(path)
  }
}

async function editProgramExercise(
  args: z.infer<typeof editSchema>,
): Promise<CoachProgramToolResult> {
  const state = await loadDayState(args.day_number)
  const current = findActiveSlot(state.activeSlots, args.current_exercise)
  const replacement = args.replacement_exercise
    ? findCatalogExercise(args.replacement_exercise)
    : null
  if (args.replacement_exercise && !replacement) {
    throw new Error(
      `"${args.replacement_exercise}" is not in the exercise library.`,
    )
  }

  const exerciseName = replacement?.name ?? current.exercise_name
  const repLow = args.rep_low ?? current.rep_low
  const repHigh = args.rep_high ?? current.rep_high
  validateRepRange(repLow, repHigh)

  const next = {
    exerciseName,
    muscleArea: replacement?.muscleArea ?? current.muscle_area ?? 'Other',
    progressBias: replacement?.progressBias ?? current.progress_bias,
    repLow,
    repHigh,
    targetRir: args.target_rir ?? current.target_rir,
    baseSets: args.sets ?? current.base_sets,
    loadIncrement: replacement?.loadIncrement ?? current.load_increment,
    seedLoad: replacement ? null : current.seed_load,
    isBodyweight: replacement?.isBodyweight ?? current.is_bodyweight,
  }

  if (
    next.exerciseName === current.exercise_name &&
    next.muscleArea === current.muscle_area &&
    next.progressBias === current.progress_bias &&
    next.repLow === current.rep_low &&
    next.repHigh === current.rep_high &&
    next.targetRir === current.target_rir &&
    next.baseSets === current.base_sets &&
    next.loadIncrement === current.load_increment &&
    next.seedLoad === current.seed_load &&
    next.isBodyweight === current.is_bodyweight
  ) {
    return { ok: true, message: 'The exercise already matches that setup.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('replace_active_program_slot', {
    p_slot_id: current.id,
    p_exercise_name: next.exerciseName,
    p_muscle_area: next.muscleArea,
    p_progress_bias: next.progressBias,
    p_rep_low: next.repLow,
    p_rep_high: next.repHigh,
    p_target_rir: next.targetRir,
    p_base_sets: next.baseSets,
    p_load_increment: next.loadIncrement,
    p_seed_load: next.seedLoad,
    p_is_bodyweight: next.isBodyweight,
  })
  if (error) throw error
  revalidateProgramSurfaces()

  const swapped =
    exerciseNameKey(current.exercise_name) !== exerciseNameKey(next.exerciseName)
  return {
    ok: true,
    message: swapped
      ? `Day ${args.day_number}: replaced ${current.exercise_name} with ${next.exerciseName} (${next.baseSets} sets, ${next.repLow}-${next.repHigh} reps). History was preserved.`
      : `Day ${args.day_number}: updated ${next.exerciseName} to ${next.baseSets} sets of ${next.repLow}-${next.repHigh} reps at ${next.targetRir} RIR. History was preserved.`,
  }
}

async function addProgramExercise(
  args: z.infer<typeof addSchema>,
): Promise<CoachProgramToolResult> {
  const state = await loadDayState(args.day_number)
  const exercise = findCatalogExercise(args.exercise)
  if (!exercise) {
    throw new Error(`"${args.exercise}" is not in the exercise library.`)
  }
  const repLow = args.rep_low ?? exercise.repLow
  const repHigh = args.rep_high ?? exercise.repHigh
  validateRepRange(repLow, repHigh)

  const supabase = await createClient()
  const userId = await requireUserId(supabase)
  const nextOrder =
    state.activeSlots.reduce(
      (maximum, slot) => Math.max(maximum, slot.order_index),
      -1,
    ) + 1
  const slotCode = nextGeneratedSlotCode(
    state.day.day_number,
    state.allSlots.map((slot) => slot.slot_code),
  )
  const { error } = await supabase.from('exercise_slots').insert({
    day_id: state.day.id,
    user_id: userId,
    slot_code: slotCode,
    order_index: nextOrder,
    exercise_name: exercise.name,
    muscle_area: exercise.muscleArea,
    progress_bias: exercise.progressBias,
    rep_low: repLow,
    rep_high: repHigh,
    target_rir: args.target_rir ?? 3,
    base_sets: args.sets,
    load_increment: exercise.loadIncrement,
    seed_load: null,
    is_bodyweight: exercise.isBodyweight,
  })
  if (error) throw error
  revalidateProgramSurfaces()
  return {
    ok: true,
    message: `Day ${args.day_number}: added ${exercise.name} at the end (${args.sets} sets, ${repLow}-${repHigh} reps).`,
  }
}

async function removeProgramExercise(
  args: z.infer<typeof removeSchema>,
): Promise<CoachProgramToolResult> {
  const state = await loadDayState(args.day_number)
  const current = findActiveSlot(state.activeSlots, args.exercise)
  const supabase = await createClient()
  const userId = await requireUserId(supabase)
  const { error } = await supabase
    .from('exercise_slots')
    .update({ order_index: -1000000 - Math.abs(current.order_index) })
    .eq('id', current.id)
    .eq('user_id', userId)
    .gte('order_index', 0)
  if (error) throw error
  revalidateProgramSurfaces()
  return {
    ok: true,
    message: `Day ${args.day_number}: removed ${current.exercise_name} from the current routine. Historical sessions were preserved.`,
  }
}

export async function executeCoachProgramTool(
  name: string,
  rawArguments: string,
): Promise<CoachProgramToolResult> {
  let json: unknown
  try {
    json = JSON.parse(rawArguments)
  } catch {
    return { ok: false, message: 'The coach produced invalid tool arguments.' }
  }

  try {
    if (name === 'edit_program_exercise') {
      return await editProgramExercise(editSchema.parse(json))
    }
    if (name === 'add_program_exercise') {
      return await addProgramExercise(addSchema.parse(json))
    }
    if (name === 'remove_program_exercise') {
      return await removeProgramExercise(removeSchema.parse(json))
    }
    return { ok: false, message: `Unknown coach tool: ${name}.` }
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? (error.issues[0]?.message ?? 'Invalid program edit.')
        : error instanceof Error
          ? error.message
          : 'Program edit failed.'
    return { ok: false, message }
  }
}
