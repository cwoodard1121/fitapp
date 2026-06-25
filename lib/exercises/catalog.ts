/**
 * Exercise library — a curated catalog the program editor can pick from so
 * adding an exercise auto-fills muscle area, the bodyweight toggle, and sensible
 * autoregulation defaults instead of making the user type everything.
 *
 * Pure data: no imports beyond the engine's ProgressBias type. Numbers are
 * personal-app "sane defaults", not gospel — the user edits anything after the
 * pick. loadIncrement is in the smaller standard step for the movement (lb).
 */

import type { ProgressBias } from '@/lib/engine/engine'

export interface CatalogExercise {
  name: string
  muscleArea: string
  isBodyweight: boolean
  progressBias: ProgressBias
  repLow: number
  repHigh: number
  loadIncrement: number
}

export const EXERCISE_CATALOG: CatalogExercise[] = [
  /* ----- Chest ----- */
  { name: 'Bench press', muscleArea: 'Chest', isBodyweight: false, progressBias: 'Load +5', repLow: 4, repHigh: 6, loadIncrement: 5 },
  { name: 'Incline barbell press', muscleArea: 'Upper chest', isBodyweight: false, progressBias: 'Load +5', repLow: 5, repHigh: 8, loadIncrement: 5 },
  { name: 'Incline DB press', muscleArea: 'Upper chest', isBodyweight: false, progressBias: 'Reps first', repLow: 8, repHigh: 15, loadIncrement: 5 },
  { name: 'Flat DB press', muscleArea: 'Chest', isBodyweight: false, progressBias: 'Reps first', repLow: 8, repHigh: 15, loadIncrement: 5 },
  { name: 'Machine chest press', muscleArea: 'Chest', isBodyweight: false, progressBias: 'Reps first', repLow: 10, repHigh: 15, loadIncrement: 5 },
  { name: 'Cable fly', muscleArea: 'Chest', isBodyweight: false, progressBias: 'Reps first', repLow: 12, repHigh: 20, loadIncrement: 2.5 },
  { name: 'Pec deck', muscleArea: 'Chest', isBodyweight: false, progressBias: 'Reps first', repLow: 12, repHigh: 20, loadIncrement: 5 },
  { name: 'Dip', muscleArea: 'Chest', isBodyweight: true, progressBias: 'Reps first', repLow: 6, repHigh: 12, loadIncrement: 5 },
  { name: 'Push-up', muscleArea: 'Chest', isBodyweight: true, progressBias: 'Reps first', repLow: 10, repHigh: 20, loadIncrement: 5 },

  /* ----- Back ----- */
  { name: 'Deadlift', muscleArea: 'Hamstrings', isBodyweight: false, progressBias: 'Load +5', repLow: 4, repHigh: 6, loadIncrement: 5 },
  { name: 'Pull-up', muscleArea: 'Back', isBodyweight: true, progressBias: 'Reps first', repLow: 6, repHigh: 10, loadIncrement: 5 },
  { name: 'Chin-up', muscleArea: 'Back', isBodyweight: true, progressBias: 'Reps first', repLow: 6, repHigh: 10, loadIncrement: 5 },
  { name: 'Lat pulldown', muscleArea: 'Back', isBodyweight: false, progressBias: 'Reps first', repLow: 8, repHigh: 12, loadIncrement: 5 },
  { name: 'Barbell row', muscleArea: 'Back', isBodyweight: false, progressBias: 'Reps first', repLow: 8, repHigh: 12, loadIncrement: 5 },
  { name: 'Pendlay row', muscleArea: 'Back', isBodyweight: false, progressBias: 'Load +5', repLow: 5, repHigh: 8, loadIncrement: 5 },
  { name: 'Seated cable row', muscleArea: 'Back', isBodyweight: false, progressBias: 'Reps first', repLow: 10, repHigh: 15, loadIncrement: 5 },
  { name: 'Single-arm DB row', muscleArea: 'Back', isBodyweight: false, progressBias: 'Reps first', repLow: 8, repHigh: 12, loadIncrement: 5 },
  { name: 'Chest-supported row', muscleArea: 'Back', isBodyweight: false, progressBias: 'Reps first', repLow: 10, repHigh: 15, loadIncrement: 5 },
  { name: 'Straight-arm pulldown', muscleArea: 'Back', isBodyweight: false, progressBias: 'Reps first', repLow: 12, repHigh: 20, loadIncrement: 2.5 },

  /* ----- Shoulders ----- */
  { name: 'Overhead press', muscleArea: 'Shoulders', isBodyweight: false, progressBias: 'Load +5', repLow: 5, repHigh: 8, loadIncrement: 5 },
  { name: 'Seated DB shoulder press', muscleArea: 'Shoulders', isBodyweight: false, progressBias: 'Reps first', repLow: 8, repHigh: 12, loadIncrement: 5 },
  { name: 'DB lateral raise', muscleArea: 'Side delts', isBodyweight: false, progressBias: 'Reps first', repLow: 12, repHigh: 20, loadIncrement: 2.5 },
  { name: 'Cable lateral raise', muscleArea: 'Side delts', isBodyweight: false, progressBias: 'Reps first', repLow: 12, repHigh: 20, loadIncrement: 2.5 },
  { name: 'Face pull', muscleArea: 'Rear delts', isBodyweight: false, progressBias: 'Reps first', repLow: 12, repHigh: 20, loadIncrement: 2.5 },
  { name: 'Reverse pec deck', muscleArea: 'Rear delts', isBodyweight: false, progressBias: 'Reps first', repLow: 12, repHigh: 20, loadIncrement: 5 },

  /* ----- Biceps ----- */
  { name: 'Barbell curl', muscleArea: 'Biceps', isBodyweight: false, progressBias: 'Reps first', repLow: 8, repHigh: 12, loadIncrement: 2.5 },
  { name: 'Incline DB curl', muscleArea: 'Biceps', isBodyweight: false, progressBias: 'Reps first', repLow: 8, repHigh: 15, loadIncrement: 2.5 },
  { name: 'Hammer curl', muscleArea: 'Biceps/forearms', isBodyweight: false, progressBias: 'Reps first', repLow: 10, repHigh: 15, loadIncrement: 2.5 },
  { name: 'Cable curl', muscleArea: 'Biceps', isBodyweight: false, progressBias: 'Reps first', repLow: 10, repHigh: 15, loadIncrement: 2.5 },
  { name: 'Preacher curl', muscleArea: 'Biceps', isBodyweight: false, progressBias: 'Reps first', repLow: 8, repHigh: 12, loadIncrement: 2.5 },

  /* ----- Triceps ----- */
  { name: 'Triceps pushdown', muscleArea: 'Triceps', isBodyweight: false, progressBias: 'Reps first', repLow: 10, repHigh: 15, loadIncrement: 2.5 },
  { name: 'Overhead triceps extension', muscleArea: 'Triceps', isBodyweight: false, progressBias: 'Reps first', repLow: 8, repHigh: 15, loadIncrement: 2.5 },
  { name: 'Skullcrusher', muscleArea: 'Triceps', isBodyweight: false, progressBias: 'Reps first', repLow: 8, repHigh: 12, loadIncrement: 2.5 },
  { name: 'Close-grip bench press', muscleArea: 'Triceps', isBodyweight: false, progressBias: 'Load +5', repLow: 5, repHigh: 8, loadIncrement: 5 },
  { name: 'Triceps kickback', muscleArea: 'Triceps', isBodyweight: false, progressBias: 'Reps first', repLow: 12, repHigh: 20, loadIncrement: 2.5 },

  /* ----- Quads ----- */
  { name: 'Barbell back squat', muscleArea: 'Quads', isBodyweight: false, progressBias: 'Load +5', repLow: 5, repHigh: 5, loadIncrement: 5 },
  { name: 'Front squat', muscleArea: 'Quads', isBodyweight: false, progressBias: 'Load +5', repLow: 4, repHigh: 6, loadIncrement: 5 },
  { name: 'Leg press', muscleArea: 'Quads', isBodyweight: false, progressBias: 'Reps first', repLow: 10, repHigh: 15, loadIncrement: 10 },
  { name: 'Hack squat', muscleArea: 'Quads', isBodyweight: false, progressBias: 'Reps first', repLow: 8, repHigh: 12, loadIncrement: 10 },
  { name: 'Leg extension', muscleArea: 'Quads', isBodyweight: false, progressBias: 'Reps first', repLow: 12, repHigh: 20, loadIncrement: 5 },
  { name: 'Bulgarian split squat', muscleArea: 'Quads', isBodyweight: false, progressBias: 'Reps first', repLow: 8, repHigh: 12, loadIncrement: 5 },
  { name: 'Walking lunge', muscleArea: 'Quads', isBodyweight: false, progressBias: 'Reps first', repLow: 10, repHigh: 15, loadIncrement: 5 },

  /* ----- Hamstrings ----- */
  { name: 'Romanian deadlift', muscleArea: 'Hamstrings', isBodyweight: false, progressBias: 'Reps first', repLow: 8, repHigh: 12, loadIncrement: 5 },
  { name: 'Lying leg curl', muscleArea: 'Hamstrings', isBodyweight: false, progressBias: 'Reps first', repLow: 10, repHigh: 15, loadIncrement: 5 },
  { name: 'Seated leg curl', muscleArea: 'Hamstrings', isBodyweight: false, progressBias: 'Reps first', repLow: 10, repHigh: 15, loadIncrement: 5 },
  { name: 'Good morning', muscleArea: 'Hamstrings', isBodyweight: false, progressBias: 'Reps first', repLow: 8, repHigh: 12, loadIncrement: 5 },

  /* ----- Glutes ----- */
  { name: 'Hip thrust', muscleArea: 'Glutes', isBodyweight: false, progressBias: 'Load +5', repLow: 8, repHigh: 12, loadIncrement: 5 },
  { name: 'Glute bridge', muscleArea: 'Glutes', isBodyweight: false, progressBias: 'Reps first', repLow: 10, repHigh: 15, loadIncrement: 5 },
  { name: 'Cable kickback', muscleArea: 'Glutes', isBodyweight: false, progressBias: 'Reps first', repLow: 12, repHigh: 20, loadIncrement: 2.5 },

  /* ----- Calves ----- */
  { name: 'Standing calf raise', muscleArea: 'Calves', isBodyweight: false, progressBias: 'Reps first', repLow: 10, repHigh: 20, loadIncrement: 5 },
  { name: 'Seated calf raise', muscleArea: 'Calves', isBodyweight: false, progressBias: 'Reps first', repLow: 12, repHigh: 20, loadIncrement: 5 },
  { name: 'Leg press calf raise', muscleArea: 'Calves', isBodyweight: false, progressBias: 'Reps first', repLow: 10, repHigh: 20, loadIncrement: 10 },

  /* ----- Forearms ----- */
  { name: 'Wrist curl', muscleArea: 'Forearms', isBodyweight: false, progressBias: 'Reps first', repLow: 15, repHigh: 25, loadIncrement: 2.5 },
  { name: 'Reverse wrist curl', muscleArea: 'Forearms', isBodyweight: false, progressBias: 'Reps first', repLow: 15, repHigh: 25, loadIncrement: 2.5 },
  { name: 'Reverse curl', muscleArea: 'Forearms', isBodyweight: false, progressBias: 'Reps first', repLow: 10, repHigh: 15, loadIncrement: 2.5 },

  /* ----- Abs ----- */
  { name: 'Hanging leg raise', muscleArea: 'Abs', isBodyweight: true, progressBias: 'Reps first', repLow: 10, repHigh: 20, loadIncrement: 5 },
  { name: 'Cable crunch', muscleArea: 'Abs', isBodyweight: false, progressBias: 'Reps first', repLow: 12, repHigh: 20, loadIncrement: 5 },
  { name: 'Plank', muscleArea: 'Abs', isBodyweight: true, progressBias: 'Reps first', repLow: 10, repHigh: 20, loadIncrement: 5 },
  { name: 'Ab wheel rollout', muscleArea: 'Abs', isBodyweight: true, progressBias: 'Reps first', repLow: 8, repHigh: 15, loadIncrement: 5 },
]

/** The catalog grouped by muscle area, preserving catalog order within a group. */
export function groupCatalogByMuscle(
  list: CatalogExercise[] = EXERCISE_CATALOG,
): { muscleArea: string; exercises: CatalogExercise[] }[] {
  const groups: { muscleArea: string; exercises: CatalogExercise[] }[] = []
  const index = new Map<string, CatalogExercise[]>()
  for (const ex of list) {
    let bucket = index.get(ex.muscleArea)
    if (!bucket) {
      bucket = []
      index.set(ex.muscleArea, bucket)
      groups.push({ muscleArea: ex.muscleArea, exercises: bucket })
    }
    bucket.push(ex)
  }
  return groups
}

/**
 * Filter the catalog by a free-text query against name + muscle area.
 * Empty query returns the full catalog.
 */
export function searchCatalog(
  query: string,
  list: CatalogExercise[] = EXERCISE_CATALOG,
): CatalogExercise[] {
  const q = query.trim().toLowerCase()
  if (!q) return list
  return list.filter(
    (ex) =>
      ex.name.toLowerCase().includes(q) ||
      ex.muscleArea.toLowerCase().includes(q),
  )
}
