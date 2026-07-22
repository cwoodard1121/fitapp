import { eachDayOfInterval, format, parseISO, subDays } from "date-fns"

import { createClient } from "@/lib/supabase/server"
import {
  requireUserId,
  getProfile,
  getActiveProgram,
  mesocycleNumber,
} from "@/lib/data"
import type {
  ExerciseSlot,
  ProgramDay,
  Session,
  SetLog,
  SetEntry,
  BodyMetric,
  NutritionLog,
  RecoveryMetric,
} from "@/lib/types"
import { HistoryList } from "@/components/history/history-list"
import { CopyRecentData } from "@/components/history/copy-recent-data"
import type { HistorySessionVM } from "@/components/history/types"
import {
  formatRecentDataExport,
  type RecentExportDay,
  type RecentExportWorkout,
} from "@/lib/export/recent-data"

export const metadata = { title: "History" }

function isLogged(log: SetLog): boolean {
  return (
    log.actual_load != null ||
    log.best_reps != null ||
    log.actual_sets != null ||
    log.actual_rir != null
  )
}

export default async function HistoryPage() {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)

  const [profile, program] = await Promise.all([
    getProfile(),
    getActiveProgram(),
  ])
  const unit = profile?.unit ?? "lb"
  const lengthWeeks = program?.length_weeks ?? 4
  const anchorDate = program?.start_date ?? null

  const endDate = format(new Date(), "yyyy-MM-dd")
  const startDate = format(subDays(parseISO(endDate), 13), "yyyy-MM-dd")

  const [
    sessionsRes,
    logsRes,
    slotsRes,
    daysRes,
    bodyRes,
    nutritionRes,
    recoveryRes,
  ] = await Promise.all([
    supabase.from("sessions").select("*").eq("user_id", userId),
    supabase.from("set_logs").select("*").eq("user_id", userId),
    supabase.from("exercise_slots").select("*").eq("user_id", userId),
    supabase.from("program_days").select("*").eq("user_id", userId),
    supabase
      .from("body_metrics")
      .select("*")
      .eq("user_id", userId)
      .gte("measured_on", startDate)
      .lte("measured_on", endDate),
    supabase
      .from("nutrition_logs")
      .select("*")
      .eq("user_id", userId)
      .gte("logged_on", startDate)
      .lte("logged_on", endDate),
    supabase
      .from("recovery_metrics")
      .select("*")
      .eq("user_id", userId)
      .gte("metric_date", startDate)
      .lte("metric_date", endDate),
  ])

  if (sessionsRes.error) throw sessionsRes.error
  if (logsRes.error) throw logsRes.error
  if (slotsRes.error) throw slotsRes.error
  if (daysRes.error) throw daysRes.error
  if (bodyRes.error) throw bodyRes.error
  if (nutritionRes.error) throw nutritionRes.error
  if (recoveryRes.error) throw recoveryRes.error

  const sessions = (sessionsRes.data as Session[]) ?? []
  const logs = (logsRes.data as SetLog[]) ?? []
  const slots = (slotsRes.data as ExerciseSlot[]) ?? []
  const days = (daysRes.data as ProgramDay[]) ?? []
  const bodyMetrics = (bodyRes.data as BodyMetric[]) ?? []
  const nutritionLogs = (nutritionRes.data as NutritionLog[]) ?? []
  const recoveryMetrics = (recoveryRes.data as RecoveryMetric[]) ?? []

  const slotName = new Map(slots.map((s) => [s.id, s.exercise_name]))
  const slotById = new Map(slots.map((slot) => [slot.id, slot]))
  const dayLabel = new Map(days.map((d) => [d.id, d.label]))

  // Group logged sets by session.
  const logsBySession = new Map<string, SetLog[]>()
  for (const log of logs) {
    if (!isLogged(log)) continue
    const list = logsBySession.get(log.session_id)
    if (list) list.push(log)
    else logsBySession.set(log.session_id, [log])
  }

  const allExercises = new Set<string>()

  const vms: HistorySessionVM[] = sessions
    .filter((s) => {
      const hasLogs = (logsBySession.get(s.id)?.length ?? 0) > 0
      return s.status === "done" || s.status === "in_progress" || hasLogs
    })
    .map((s) => {
      const sessionLogs = logsBySession.get(s.id) ?? []

      const exerciseNames = new Set<string>()
      let tonnage = 0
      for (const log of sessionLogs) {
        const name = slotName.get(log.slot_id)
        if (name) {
          exerciseNames.add(name)
          allExercises.add(name)
        }
        if (
          log.actual_sets != null &&
          log.best_reps != null &&
          log.actual_load != null
        ) {
          tonnage += log.actual_sets * log.best_reps * log.actual_load
        }
      }

      const dateIso = s.performed_at ?? s.created_at
      const mesocycle =
        mesocycleNumber(anchorDate, lengthWeeks, new Date(dateIso)) + 1

      return {
        id: s.id,
        week: s.week,
        mesocycle,
        dayLabel: dayLabel.get(s.day_id) ?? "Workout",
        status: s.status,
        dateIso,
        dated: s.performed_at != null,
        exercises: [...exerciseNames].sort(),
        exerciseCount: exerciseNames.size,
        tonnage,
      } satisfies HistorySessionVM
    })

  // Most recent first.
  vms.sort((a, b) => b.dateIso.localeCompare(a.dateIso))

  const exerciseNames = [...allExercises].sort((a, b) => a.localeCompare(b))

  const recentSessions = vms.filter((session) => {
    const date = format(new Date(session.dateIso), "yyyy-MM-dd")
    return date >= startDate && date <= endDate
  })
  let entries: SetEntry[] = []
  if (recentSessions.length > 0) {
    const { data, error } = await supabase
      .from("set_entries")
      .select("*")
      .eq("user_id", userId)
      .in("session_id", recentSessions.map((session) => session.id))
      .order("set_number", { ascending: true })
    if (error) throw error
    entries = (data as SetEntry[]) ?? []
  }

  const entriesByLog = new Map<string, SetEntry[]>()
  for (const entry of entries) {
    const key = `${entry.session_id}:${entry.slot_id}`
    const list = entriesByLog.get(key)
    if (list) list.push(entry)
    else entriesByLog.set(key, [entry])
  }

  const workoutsByDate = new Map<string, RecentExportWorkout[]>()
  for (const session of [...recentSessions].reverse()) {
    const date = format(new Date(session.dateIso), "yyyy-MM-dd")
    const exercises = (logsBySession.get(session.id) ?? []).map((log) => {
      const slot = slotById.get(log.slot_id)
      const setEntries = entriesByLog.get(`${session.id}:${log.slot_id}`) ?? []
      return {
        name: slot?.exercise_name ?? "Exercise",
        isBodyweight: slot?.is_bodyweight ?? false,
        sets: setEntries.map((entry) => ({
          load: entry.load,
          reps: entry.reps,
          rir: entry.rir,
        })),
        aggregate: {
          load: log.actual_load,
          reps: log.best_reps,
          sets: log.actual_sets,
          rir: log.actual_rir,
        },
        feel: {
          pump: log.pump,
          enjoyment: log.enjoyment,
          soreness: log.soreness,
          recovery: log.recovery,
        },
        performance: log.performance,
        notes: log.notes,
      }
    })
    const workout = { label: session.dayLabel, exercises }
    const list = workoutsByDate.get(date)
    if (list) list.push(workout)
    else workoutsByDate.set(date, [workout])
  }

  const bodyByDate = new Map(bodyMetrics.map((entry) => [entry.measured_on, entry]))
  const nutritionByDate = new Map(
    nutritionLogs.map((entry) => [entry.logged_on, entry]),
  )
  const recoveryByDate = new Map(
    recoveryMetrics.map((entry) => [entry.metric_date, entry]),
  )
  const exportDays: RecentExportDay[] = eachDayOfInterval({
    start: parseISO(startDate),
    end: parseISO(endDate),
  }).map((dateValue) => {
    const date = format(dateValue, "yyyy-MM-dd")
    const body = bodyByDate.get(date)
    const nutrition = nutritionByDate.get(date)
    const recovery = recoveryByDate.get(date)
    return {
      date,
      body: body
        ? {
            bodyweight: body.bodyweight,
            biaBodyfatPct: body.bia_bodyfat_pct ?? body.bodyfat_pct,
            navyBodyfatPct: body.navy_bodyfat_pct,
          }
        : null,
      nutrition: nutrition
        ? {
            calories: nutrition.calories,
            protein: nutrition.protein,
            carbs: nutrition.carbs,
            fat: nutrition.fat,
          }
        : null,
      recovery: recovery
        ? {
            steps: recovery.steps,
            sleepMinutes: recovery.sleep_minutes_asleep,
            deepMinutes: recovery.sleep_deep_min,
            remMinutes: recovery.sleep_rem_min,
            restingHr: recovery.resting_hr,
            hrvMs: recovery.hrv_ms,
          }
        : null,
      workouts: workoutsByDate.get(date) ?? [],
    }
  })
  const exportText = formatRecentDataExport({
    startDate,
    endDate,
    unit,
    days: exportDays,
  })

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5">
      <header className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
            simplegym
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">History</h1>
          <p className="text-sm text-muted">
            Past sessions, what you lifted, and what the engine decided.
          </p>
        </div>
        <CopyRecentData text={exportText} />
      </header>

      <HistoryList
        sessions={vms}
        exerciseNames={exerciseNames}
        unit={unit}
      />
    </div>
  )
}
