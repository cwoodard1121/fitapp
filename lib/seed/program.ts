import type { ProgressBias } from '@/lib/engine/engine'

/**
 * The user's existing mesocycle (handoff §6), expressed as a typed constant.
 * Rep ranges parsed to repLow/repHigh; single values set both equal.
 * load_increment defaults to 5, 2.5 for small isolation lifts. Bodyweight
 * movements (pull-ups) have seedLoad null AND isBodyweight true so the engine
 * progresses them by reps/sets only. An unseeded barbell lift also has seedLoad
 * null but isBodyweight false — it calibrates its load from the first session.
 *
 * Stored in camelCase; lib/data/seed.ts maps to snake_case rows on insert.
 */
export interface SeedSlot {
  slotCode: string
  orderIndex: number
  exerciseName: string
  muscleArea: string | null
  progressBias: ProgressBias
  repLow: number
  repHigh: number
  targetRir: number
  baseSets: number
  loadIncrement: number
  seedLoad: number | null
  /** Optional; defaults to false. True only for genuine bodyweight movements. */
  isBodyweight?: boolean
}

export interface SeedDay {
  dayNumber: number
  label: string
  slots: SeedSlot[]
}

export interface SeedProgram {
  name: string
  lengthWeeks: number
  deloadWeek: number
  days: SeedDay[]
}

export const DEFAULT_PROGRAM: SeedProgram = {
  name: 'Fat Loss + Muscle Regain',
  lengthWeeks: 5,
  deloadWeek: 5,
  days: [
    {
      dayNumber: 1,
      label: 'Day 1 Chest / Back / Shoulders',
      slots: [
        {
          slotCode: 'D1A1',
          orderIndex: 0,
          exerciseName: 'DB incline bench',
          muscleArea: 'Upper chest',
          progressBias: 'Reps first',
          repLow: 8,
          repHigh: 15,
          targetRir: 3,
          baseSets: 2,
          loadIncrement: 5,
          seedLoad: 75,
        },
        {
          slotCode: 'D1A2',
          orderIndex: 1,
          exerciseName: 'Pull-up',
          muscleArea: 'Back',
          progressBias: 'Reps first',
          repLow: 6,
          repHigh: 10,
          targetRir: 3,
          baseSets: 2,
          loadIncrement: 5,
          seedLoad: null,
          isBodyweight: true,
        },
        {
          slotCode: 'D1A3',
          orderIndex: 2,
          exerciseName: 'Row',
          muscleArea: 'Back',
          progressBias: 'Reps first',
          repLow: 10,
          repHigh: 15,
          targetRir: 3,
          baseSets: 2,
          loadIncrement: 5,
          seedLoad: 145,
        },
        {
          slotCode: 'D1A4',
          orderIndex: 3,
          exerciseName: 'Cable lateral raise',
          muscleArea: 'Side delts',
          progressBias: 'Reps first',
          repLow: 12,
          repHigh: 20,
          targetRir: 3,
          baseSets: 3,
          loadIncrement: 2.5,
          seedLoad: 15,
        },
        {
          slotCode: 'D1A5',
          orderIndex: 4,
          exerciseName: 'Pushdown',
          muscleArea: 'Triceps',
          progressBias: 'Reps first',
          repLow: 10,
          repHigh: 15,
          targetRir: 3,
          baseSets: 2,
          loadIncrement: 2.5,
          seedLoad: 65,
        },
      ],
    },
    {
      dayNumber: 2,
      label: 'Day 2 Shoulders / Back / Arms',
      slots: [
        {
          slotCode: 'D2A1',
          orderIndex: 0,
          exerciseName: 'Cable lateral raise',
          muscleArea: 'Side delts',
          progressBias: 'Reps first',
          repLow: 15,
          repHigh: 25,
          targetRir: 3,
          baseSets: 3,
          loadIncrement: 2.5,
          seedLoad: 15,
        },
        {
          slotCode: 'D2A2',
          orderIndex: 1,
          exerciseName: 'Seated lateral raise',
          muscleArea: 'Side delts',
          progressBias: 'Reps first',
          repLow: 6,
          repHigh: 15,
          targetRir: 3,
          baseSets: 2,
          loadIncrement: 2.5,
          seedLoad: null,
        },
        {
          slotCode: 'D2A3',
          orderIndex: 2,
          exerciseName: 'Pull-up / pulldown',
          muscleArea: 'Back',
          progressBias: 'Reps first',
          repLow: 8,
          repHigh: 12,
          targetRir: 3,
          baseSets: 2,
          loadIncrement: 5,
          seedLoad: null,
          isBodyweight: true,
        },
        {
          slotCode: 'D2A4',
          orderIndex: 3,
          exerciseName: 'Row',
          muscleArea: 'Back',
          progressBias: 'Reps first',
          repLow: 8,
          repHigh: 12,
          targetRir: 3,
          baseSets: 2,
          loadIncrement: 5,
          seedLoad: null,
        },
        {
          slotCode: 'D2A5',
          orderIndex: 4,
          exerciseName: 'Barbell curl',
          muscleArea: 'Biceps',
          progressBias: 'Reps first',
          repLow: 6,
          repHigh: 12,
          targetRir: 3,
          baseSets: 2,
          loadIncrement: 2.5,
          seedLoad: null,
        },
        {
          slotCode: 'D2A6',
          orderIndex: 5,
          exerciseName: 'Pushdown',
          muscleArea: 'Triceps',
          progressBias: 'Reps first',
          repLow: 10,
          repHigh: 15,
          targetRir: 3,
          baseSets: 3,
          loadIncrement: 2.5,
          seedLoad: 65,
        },
      ],
    },
    {
      dayNumber: 3,
      label: 'Day 3 Back / Chest / Shoulders',
      slots: [
        {
          slotCode: 'D3A1',
          orderIndex: 0,
          exerciseName: 'Pull-up',
          muscleArea: 'Back',
          progressBias: 'Reps first',
          repLow: 8,
          repHigh: 20,
          targetRir: 3,
          baseSets: 2,
          loadIncrement: 5,
          seedLoad: null,
          isBodyweight: true,
        },
        {
          slotCode: 'D3A2',
          orderIndex: 1,
          exerciseName: 'Row',
          muscleArea: 'Back',
          progressBias: 'Reps first',
          repLow: 10,
          repHigh: 15,
          targetRir: 3,
          baseSets: 2,
          loadIncrement: 5,
          seedLoad: null,
        },
        {
          slotCode: 'D3A3',
          orderIndex: 2,
          exerciseName: 'Touch and go bench',
          muscleArea: 'Chest',
          progressBias: 'Load +5',
          repLow: 5,
          repHigh: 8,
          targetRir: 3,
          baseSets: 1,
          loadIncrement: 5,
          seedLoad: null,
        },
        {
          slotCode: 'D3A4',
          orderIndex: 3,
          exerciseName: 'DB incline bench',
          muscleArea: 'Upper chest',
          progressBias: 'Reps first',
          repLow: 8,
          repHigh: 12,
          targetRir: 3,
          baseSets: 2,
          loadIncrement: 5,
          seedLoad: 75,
        },
        {
          slotCode: 'D3A5',
          orderIndex: 4,
          exerciseName: 'Dumbbell lateral raise',
          muscleArea: 'Side delts',
          progressBias: 'Reps first',
          repLow: 12,
          repHigh: 20,
          targetRir: 3,
          baseSets: 3,
          loadIncrement: 2.5,
          seedLoad: null,
        },
        {
          slotCode: 'D3A6',
          orderIndex: 5,
          exerciseName: 'Incline curl',
          muscleArea: 'Biceps',
          progressBias: 'Reps first',
          repLow: 8,
          repHigh: 15,
          targetRir: 3,
          baseSets: 3,
          loadIncrement: 2.5,
          seedLoad: 30,
        },
      ],
    },
    {
      dayNumber: 4,
      label: 'Day 4 Legs / Arms',
      slots: [
        {
          slotCode: 'D4A1',
          orderIndex: 0,
          exerciseName: 'Squat',
          muscleArea: 'Legs',
          progressBias: 'Load +5',
          repLow: 5,
          repHigh: 5,
          targetRir: 3,
          baseSets: 5,
          loadIncrement: 5,
          seedLoad: null,
        },
        {
          slotCode: 'D4A2',
          orderIndex: 1,
          exerciseName: 'Deadlift (or RDL)',
          muscleArea: 'Legs',
          progressBias: 'Load +5',
          repLow: 5,
          repHigh: 5,
          targetRir: 3,
          baseSets: 5,
          loadIncrement: 5,
          seedLoad: null,
        },
        {
          slotCode: 'D4A3',
          orderIndex: 2,
          exerciseName: 'Reverse curl',
          muscleArea: 'Biceps/forearms',
          progressBias: 'Reps first',
          repLow: 10,
          repHigh: 15,
          targetRir: 3,
          baseSets: 3,
          loadIncrement: 2.5,
          seedLoad: null,
        },
        {
          slotCode: 'D4A4',
          orderIndex: 3,
          exerciseName: 'Barbell wrist curl',
          muscleArea: 'Forearms',
          progressBias: 'Reps first',
          repLow: 15,
          repHigh: 25,
          targetRir: 3,
          baseSets: 3,
          loadIncrement: 2.5,
          seedLoad: null,
        },
      ],
    },
  ],
}
