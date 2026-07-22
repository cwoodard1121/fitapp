import type { Unit } from "@/lib/types"

export interface RecentExportSet {
  load: number | null
  reps: number | null
  rir: number | null
}

export interface RecentExportExercise {
  name: string
  isBodyweight: boolean
  sets: RecentExportSet[]
  aggregate: {
    load: number | null
    reps: number | null
    sets: number | null
    rir: number | null
  } | null
  feel: {
    pump: number | null
    enjoyment: number | null
    soreness: number | null
    recovery: number | null
  }
  performance: string | null
  notes: string | null
}

export interface RecentExportWorkout {
  label: string
  exercises: RecentExportExercise[]
}

export interface RecentExportDay {
  date: string
  body: {
    bodyweight: number | null
    biaBodyfatPct: number | null
    navyBodyfatPct: number | null
  } | null
  nutrition: {
    calories: number | null
    protein: number | null
    carbs: number | null
    fat: number | null
  } | null
  recovery: {
    steps: number | null
    sleepMinutes: number | null
    deepMinutes: number | null
    remMinutes: number | null
    restingHr: number | null
    hrvMs: number | null
  } | null
  workouts: RecentExportWorkout[]
}

export interface RecentExportData {
  startDate: string
  endDate: string
  unit: Unit
  days: RecentExportDay[]
}

function number(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)))
}

function present(value: number | null, prefix: string, suffix = ""): string | null {
  return value == null ? null : `${prefix}${number(value)}${suffix}`
}

function cleanText(value: string): string {
  return value.replace(/[|;\r\n]+/g, " ").replace(/\s+/g, " ").trim()
}

function compactNote(value: string): string {
  const cleaned = cleanText(value)
  return cleaned.length > 160 ? `${cleaned.slice(0, 157)}...` : cleaned
}

function setToken(set: RecentExportSet, isBodyweight: boolean): string {
  const load = isBodyweight
    ? set.load == null || set.load === 0
      ? "BW"
      : `BW+${number(set.load)}`
    : set.load == null
      ? "?"
      : number(set.load)
  const reps = set.reps == null ? "?" : number(set.reps)
  const rir = set.rir == null ? "" : `@${number(set.rir)}`
  return `${load}x${reps}${rir}`
}

function exerciseToken(exercise: RecentExportExercise): string {
  let dose: string
  if (exercise.sets.length > 0) {
    const tokens = exercise.sets.map((set) => setToken(set, exercise.isBodyweight))
    const runs: { token: string; count: number }[] = []
    for (const token of tokens) {
      const last = runs[runs.length - 1]
      if (last?.token === token) last.count += 1
      else runs.push({ token, count: 1 })
    }
    dose = runs
      .map(({ token, count }) => (count === 1 ? token : `${token}*${count}`))
      .join(",")
  } else if (exercise.aggregate) {
    const { load, reps, sets, rir } = exercise.aggregate
    const loadToken = exercise.isBodyweight
      ? load == null || load === 0
        ? "BW"
        : `BW+${number(load)}`
      : load == null
        ? "?"
        : number(load)
    dose = `${loadToken}x${reps == null ? "?" : number(reps)}x${sets == null ? "?" : number(sets)}`
    if (rir != null) dose += `@${number(rir)}`
  } else {
    dose = "logged"
  }

  const extras: string[] = []
  const feel = [
    exercise.feel.pump,
    exercise.feel.enjoyment,
    exercise.feel.soreness,
    exercise.feel.recovery,
  ]
  if (feel.some((value) => value != null)) {
    extras.push(`feel=${feel.map((value) => (value == null ? "-" : number(value))).join("/")}`)
  }
  if (exercise.performance) extras.push(`perf=${cleanText(exercise.performance).toLowerCase()}`)
  if (exercise.notes?.trim()) extras.push(`note=${compactNote(exercise.notes)}`)

  return `${cleanText(exercise.name)}[${[dose, ...extras].join(";")}]`
}

function bodyToken(day: RecentExportDay): string | null {
  if (!day.body) return null
  const values = [
    present(day.body.bodyweight, "BW="),
    present(day.body.biaBodyfatPct, "BFbia=", "%"),
    present(day.body.navyBodyfatPct, "BFnavy=", "%"),
  ].filter((value): value is string => value != null)
  return values.length > 0 ? `B ${values.join(" ")}` : null
}

function nutritionToken(day: RecentExportDay): string | null {
  if (!day.nutrition) return null
  const values = [
    present(day.nutrition.calories, "kcal="),
    present(day.nutrition.protein, "P="),
    present(day.nutrition.carbs, "C="),
    present(day.nutrition.fat, "F="),
  ].filter((value): value is string => value != null)
  return values.length > 0 ? `N ${values.join(" ")}` : null
}

function recoveryToken(day: RecentExportDay): string | null {
  if (!day.recovery) return null
  const sleep = day.recovery.sleepMinutes
  const roundedSleep = sleep == null ? null : Math.round(sleep)
  const sleepToken =
    roundedSleep == null
      ? null
      : `sleep=${Math.floor(roundedSleep / 60)}h${String(roundedSleep % 60).padStart(2, "0")}`
  const values = [
    present(day.recovery.steps, "steps="),
    sleepToken,
    present(day.recovery.deepMinutes, "deep="),
    present(day.recovery.remMinutes, "REM="),
    present(day.recovery.restingHr, "RHR="),
    present(day.recovery.hrvMs, "HRV="),
  ].filter((value): value is string => value != null)
  return values.length > 0 ? `R ${values.join(" ")}` : null
}

function workoutsToken(day: RecentExportDay): string | null {
  if (day.workouts.length === 0) return null
  const workouts = day.workouts.map((workout) => {
    const exercises = workout.exercises.map(exerciseToken).join(" ")
    return `${cleanText(workout.label)}: ${exercises || "logged"}`
  })
  return `W ${workouts.join(" / ")}`
}

/** Compact, line-oriented text intended to be pasted directly into an LLM. */
export function formatRecentDataExport(data: RecentExportData): string {
  const header =
    `SimpleGym 14d ${data.startDate}..${data.endDate} | BW/load=${data.unit} | ` +
    "sets=loadxreps@RIR | feel=pump/enjoyment/soreness/recovery(1-10)"
  const lines = data.days.map((day) => {
    const tokens = [bodyToken(day), nutritionToken(day), recoveryToken(day), workoutsToken(day)].filter(
      (value): value is string => value != null,
    )
    return `${day.date.slice(2)} | ${tokens.length > 0 ? tokens.join(" | ") : "-"}`
  })
  return [header, ...lines].join("\n")
}
