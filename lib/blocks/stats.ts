import {
  addDays,
  differenceInCalendarDays,
  format,
  isAfter,
  isBefore,
  parseISO,
} from "date-fns"

import type {
  Block,
  BodyMetric,
  ExerciseSlot,
  NutritionLog,
  RecoveryMetric,
  Session,
  SetEntry,
  SetLog,
} from "@/lib/types"

export type BlockStatsStatus = "observed" | "upcoming" | "undated"

export interface TrainingBlockStats {
  sessions: number
  trainingDays: number
  avgTrainingDaysPerWeek: number | null
  exerciseCount: number
  workingSets: number
  avgSetsPerSession: number | null
  avgSetsPerTrainingDay: number | null
  totalReps: number
  avgRepsPerSet: number | null
  totalVolume: number
  avgVolumePerSession: number | null
  avgRir: number | null
}

export interface NutritionBlockStats {
  daysLogged: number
  coveragePct: number | null
  avgCalories: number | null
  avgProtein: number | null
  avgCarbs: number | null
  avgFat: number | null
  avgCaloriesVsTarget: number | null
  avgProteinVsTarget: number | null
  calorieTargetHitPct: number | null
  proteinTargetHitPct: number | null
  calorieStdDev: number | null
  longestLoggingStreak: number
}

export interface ActivityBlockStats {
  stepBaseline: number
  daysLogged: number
  coveragePct: number | null
  avgSteps: number | null
  totalSteps: number
  minSteps: number | null
  maxSteps: number | null
  avgStepsVsBaseline: number | null
  baselineHitPct: number | null
}

export interface BodyBlockStats {
  checkIns: number
  weightCheckIns: number
  startWeight: number | null
  endWeight: number | null
  avgWeight: number | null
  weightChange: number | null
  weightRatePerWeek: number | null
  bodyfatCheckIns: number
  startBodyfat: number | null
  endBodyfat: number | null
  avgBodyfat: number | null
  bodyfatChange: number | null
}

export interface BlockStats {
  blockId: string
  status: BlockStatsStatus
  observedStart: string | null
  observedEnd: string | null
  observedDays: number
  observedWeeks: number
  dataDays: number
  training: TrainingBlockStats
  activity: ActivityBlockStats
  nutrition: NutritionBlockStats
  body: BodyBlockStats
}

export interface ComputeBlockStatsInput {
  block: Block
  today: string
  sessions: Session[]
  setLogs: SetLog[]
  setEntries: SetEntry[]
  slots: ExerciseSlot[]
  recoveryMetrics: RecoveryMetric[]
  stepBaseline: number
  nutritionLogs: NutritionLog[]
  bodyMetrics: BodyMetric[]
}

interface ObservedWindow {
  status: BlockStatsStatus
  start: string | null
  end: string | null
  days: number
  weeks: number
}

function observedWindow(block: Block, today: string): ObservedWindow {
  if (!block.start_date) {
    return { status: "undated", start: null, end: null, days: 0, weeks: 0 }
  }

  const start = parseISO(block.start_date)
  const todayDate = parseISO(today)
  if (isAfter(start, todayDate)) {
    return {
      status: "upcoming",
      start: block.start_date,
      end: block.start_date,
      days: 0,
      weeks: 0,
    }
  }

  let plannedEnd = todayDate
  if (block.end_date) {
    plannedEnd = parseISO(block.end_date)
  } else if (block.length_weeks != null && block.length_weeks > 0) {
    plannedEnd = addDays(start, block.length_weeks * 7 - 1)
  }

  const end = isBefore(plannedEnd, todayDate) ? plannedEnd : todayDate
  if (isBefore(end, start)) {
    return { status: "undated", start: null, end: null, days: 0, weeks: 0 }
  }

  const days = differenceInCalendarDays(end, start) + 1
  return {
    status: "observed",
    start: block.start_date,
    end: format(end, "yyyy-MM-dd"),
    days,
    weeks: Math.max(1, Math.ceil(days / 7)),
  }
}

function inWindow(date: string, window: ObservedWindow): boolean {
  return (
    window.status === "observed" &&
    window.start != null &&
    window.end != null &&
    date >= window.start &&
    date <= window.end
  )
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function standardDeviation(values: number[]): number | null {
  const mean = average(values)
  if (mean == null) return null
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    values.length
  return Math.sqrt(variance)
}

function percentage(numerator: number, denominator: number): number | null {
  return denominator > 0 ? (numerator / denominator) * 100 : null
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null
}

function loggingStreak(dates: string[]): number {
  const sorted = [...new Set(dates)].sort()
  let longest = 0
  let current = 0
  let previous: Date | null = null

  for (const value of sorted) {
    const date = parseISO(value)
    current =
      previous != null && differenceInCalendarDays(date, previous) === 1
        ? current + 1
        : 1
    longest = Math.max(longest, current)
    previous = date
  }

  return longest
}

function bodyfat(metric: BodyMetric): number | null {
  return (
    metric.bodyfat_pct ??
    metric.bia_bodyfat_pct ??
    metric.navy_bodyfat_pct ??
    null
  )
}

export function computeBlockStats(input: ComputeBlockStatsInput): BlockStats {
  const {
    block,
    today,
    sessions,
    setLogs,
    setEntries,
    slots,
    recoveryMetrics,
    stepBaseline,
    nutritionLogs,
    bodyMetrics,
  } = input
  const window = observedWindow(block, today)

  const scopedSessions = sessions.filter((session) => {
    if (session.status !== "done" || session.performed_at == null) return false
    if (!inWindow(session.performed_at.slice(0, 10), window)) return false
    return !(
      block.kind === "training" &&
      block.program_id != null &&
      session.program_id !== block.program_id
    )
  })
  const sessionIds = new Set(scopedSessions.map((session) => session.id))
  const trainingDates = new Set(
    scopedSessions.map((session) => session.performed_at!.slice(0, 10)),
  )

  const scopedLogs = setLogs.filter((log) => sessionIds.has(log.session_id))
  const scopedEntries = setEntries.filter((entry) => sessionIds.has(entry.session_id))
  const logsByKey = new Map(
    scopedLogs.map((log) => [`${log.session_id}:${log.slot_id}`, log]),
  )
  const entriesByKey = new Map<string, SetEntry[]>()
  for (const entry of scopedEntries) {
    const key = `${entry.session_id}:${entry.slot_id}`
    const rows = entriesByKey.get(key) ?? []
    rows.push(entry)
    entriesByKey.set(key, rows)
  }

  const slotNames = new Map(slots.map((slot) => [slot.id, slot.exercise_name]))
  const exercises = new Set<string>()
  let workingSets = 0
  let totalReps = 0
  let totalVolume = 0
  let rirTotal = 0
  let rirCount = 0

  const setKeys = new Set([...logsByKey.keys(), ...entriesByKey.keys()])
  for (const key of setKeys) {
    const log = logsByKey.get(key)
    const entries = (entriesByKey.get(key) ?? []).filter(
      (entry) => entry.load != null || entry.reps != null,
    )
    const slotId = log?.slot_id ?? entries[0]?.slot_id

    if (entries.length > 0) {
      if (slotId) exercises.add(slotNames.get(slotId) ?? slotId)
      workingSets += entries.length
      for (const entry of entries) {
        if (entry.reps != null) totalReps += entry.reps
        if (entry.load != null && entry.reps != null) {
          totalVolume += entry.load * entry.reps
        }
        if (entry.rir != null) {
          rirTotal += entry.rir
          rirCount += 1
        }
      }
      continue
    }

    const sets = Math.max(0, Math.round(log?.actual_sets ?? 0))
    if (sets > 0 && slotId) exercises.add(slotNames.get(slotId) ?? slotId)
    workingSets += sets
    if (log?.best_reps != null) totalReps += log.best_reps * sets
    if (log?.actual_load != null && log.best_reps != null) {
      totalVolume += log.actual_load * log.best_reps * sets
    }
    if (log?.actual_rir != null && sets > 0) {
      rirTotal += log.actual_rir * sets
      rirCount += sets
    }
  }

  const scopedNutrition = nutritionLogs.filter(
    (log) =>
      inWindow(log.logged_on, window) &&
      (log.calories != null ||
        log.protein != null ||
        log.carbs != null ||
        log.fat != null),
  )
  const calorieValues = scopedNutrition.flatMap((log) =>
    log.calories == null ? [] : [log.calories],
  )
  const proteinValues = scopedNutrition.flatMap((log) =>
    log.protein == null ? [] : [log.protein],
  )
  const carbValues = scopedNutrition.flatMap((log) =>
    log.carbs == null ? [] : [log.carbs],
  )
  const fatValues = scopedNutrition.flatMap((log) =>
    log.fat == null ? [] : [log.fat],
  )
  const avgCalories = average(calorieValues)
  const avgProtein = average(proteinValues)
  const calorieTargetHits =
    block.calorie_target != null && block.calorie_target > 0
      ? calorieValues.filter(
          (calories) =>
            Math.abs(calories - block.calorie_target!) <=
            block.calorie_target! * 0.1,
        ).length
      : 0
  const proteinTargetHits =
    block.protein_target != null && block.protein_target > 0
      ? proteinValues.filter((protein) => protein >= block.protein_target!).length
      : 0

  const scopedRecovery = recoveryMetrics
    .filter(
      (metric): metric is RecoveryMetric & { steps: number } =>
        metric.steps != null &&
        metric.metric_date !== today &&
        inWindow(metric.metric_date, window),
    )
    .sort((a, b) => a.metric_date.localeCompare(b.metric_date))
  const stepValues = scopedRecovery.map((metric) => metric.steps)
  const avgSteps = average(stepValues)

  const scopedBody = bodyMetrics
    .filter((metric) => inWindow(metric.measured_on, window))
    .sort((a, b) => a.measured_on.localeCompare(b.measured_on))
  const weightRows = scopedBody.filter(
    (metric): metric is BodyMetric & { bodyweight: number } =>
      metric.bodyweight != null,
  )
  const bodyfatRows = scopedBody.flatMap((metric) => {
    const value = bodyfat(metric)
    return value == null ? [] : [{ date: metric.measured_on, value }]
  })
  const startWeight = weightRows[0]?.bodyweight ?? null
  const endWeight = weightRows.at(-1)?.bodyweight ?? null
  const weightChange =
    startWeight != null && endWeight != null && weightRows.length > 1
      ? endWeight - startWeight
      : null
  const weightSpanDays =
    weightRows.length > 1
      ? differenceInCalendarDays(
          parseISO(weightRows.at(-1)!.measured_on),
          parseISO(weightRows[0].measured_on),
        )
      : 0
  const startBodyfat = bodyfatRows[0]?.value ?? null
  const endBodyfat = bodyfatRows.at(-1)?.value ?? null

  const dataDates = new Set<string>(trainingDates)
  for (const log of scopedNutrition) dataDates.add(log.logged_on)
  for (const metric of scopedRecovery) dataDates.add(metric.metric_date)
  for (const metric of scopedBody) dataDates.add(metric.measured_on)

  return {
    blockId: block.id,
    status: window.status,
    observedStart: window.start,
    observedEnd: window.end,
    observedDays: window.days,
    observedWeeks: window.weeks,
    dataDays: dataDates.size,
    training: {
      sessions: scopedSessions.length,
      trainingDays: trainingDates.size,
      avgTrainingDaysPerWeek: ratio(trainingDates.size, window.weeks),
      exerciseCount: exercises.size,
      workingSets,
      avgSetsPerSession: ratio(workingSets, scopedSessions.length),
      avgSetsPerTrainingDay: ratio(workingSets, trainingDates.size),
      totalReps,
      avgRepsPerSet: ratio(totalReps, workingSets),
      totalVolume,
      avgVolumePerSession: ratio(totalVolume, scopedSessions.length),
      avgRir: ratio(rirTotal, rirCount),
    },
    activity: {
      stepBaseline,
      daysLogged: scopedRecovery.length,
      coveragePct: percentage(scopedRecovery.length, window.days),
      avgSteps,
      totalSteps: stepValues.reduce((sum, steps) => sum + steps, 0),
      minSteps: stepValues.length > 0 ? Math.min(...stepValues) : null,
      maxSteps: stepValues.length > 0 ? Math.max(...stepValues) : null,
      avgStepsVsBaseline: avgSteps == null ? null : avgSteps - stepBaseline,
      baselineHitPct: percentage(
        stepValues.filter((steps) => steps >= stepBaseline).length,
        stepValues.length,
      ),
    },
    nutrition: {
      daysLogged: scopedNutrition.length,
      coveragePct: percentage(scopedNutrition.length, window.days),
      avgCalories,
      avgProtein,
      avgCarbs: average(carbValues),
      avgFat: average(fatValues),
      avgCaloriesVsTarget:
        avgCalories != null && block.calorie_target != null
          ? avgCalories - block.calorie_target
          : null,
      avgProteinVsTarget:
        avgProtein != null && block.protein_target != null
          ? avgProtein - block.protein_target
          : null,
      calorieTargetHitPct:
        block.calorie_target != null && block.calorie_target > 0
          ? percentage(calorieTargetHits, calorieValues.length)
          : null,
      proteinTargetHitPct:
        block.protein_target != null && block.protein_target > 0
          ? percentage(proteinTargetHits, proteinValues.length)
          : null,
      calorieStdDev: standardDeviation(calorieValues),
      longestLoggingStreak: loggingStreak(
        scopedNutrition.map((log) => log.logged_on),
      ),
    },
    body: {
      checkIns: scopedBody.filter(
        (metric) => metric.bodyweight != null || bodyfat(metric) != null,
      ).length,
      weightCheckIns: weightRows.length,
      startWeight,
      endWeight,
      avgWeight: average(weightRows.map((metric) => metric.bodyweight)),
      weightChange,
      weightRatePerWeek:
        weightChange != null && weightSpanDays > 0
          ? (weightChange / weightSpanDays) * 7
          : null,
      bodyfatCheckIns: bodyfatRows.length,
      startBodyfat,
      endBodyfat,
      avgBodyfat: average(bodyfatRows.map((row) => row.value)),
      bodyfatChange:
        startBodyfat != null && endBodyfat != null && bodyfatRows.length > 1
          ? endBodyfat - startBodyfat
          : null,
    },
  }
}
