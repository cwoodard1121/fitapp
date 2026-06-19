import type { Metadata } from "next"
import type { ReactNode } from "react"

import type { ExerciseSlot, SetLog, Unit } from "@/lib/types"
import {
  getActiveProgram,
  getProfile,
  getProgramFull,
  requireUserId,
  slotConfigFromRow,
  setLogInputFromRow,
  derivePrevTargets,
} from "@/lib/data"
import { evaluateSlot, detectStall } from "@/lib/engine/engine"
import { createClient } from "@/lib/supabase/server"

import { ProgressView, ProgressEmpty } from "@/components/progress/progress-view"
import type {
  ExercisePoint,
  ExerciseSeries,
  ProgressData,
  VolumeWeekRow,
} from "@/components/progress/types"

export const metadata: Metadata = {
  title: "Progress",
}

export default async function ProgressPage() {
  const profile = await getProfile()
  const unit: Unit = profile?.unit ?? "lb"

  const program = await getActiveProgram()
  if (!program) {
    return (
      <PageShell>
        <ProgressEmpty reason="no-program" />
      </PageShell>
    )
  }

  const full = await getProgramFull(program.id)
  const slots = full?.slots ?? []
  const slotById = new Map<string, ExerciseSlot>(slots.map((s) => [s.id, s]))

  // All logged sets for the user, oldest -> newest. RLS scopes to the user;
  // we also pin user_id explicitly.
  const supabase = await createClient()
  const userId = await requireUserId(supabase)
  const { data: logRows, error } = await supabase
    .from("set_logs")
    .select("*")
    .eq("user_id", userId)
    .order("week", { ascending: true })
    .order("created_at", { ascending: true })
  if (error) throw error
  const logs = (logRows as SetLog[]) ?? []

  const deloadWeek = program.deload_week

  /* --- Group logs by exercise_name and run the engine in sequence. --- */
  const groups = new Map<string, { slot: ExerciseSlot; logs: SetLog[] }>()
  for (const log of logs) {
    const slot = slotById.get(log.slot_id)
    if (!slot) continue
    const key = slot.exercise_name
    const g = groups.get(key)
    if (g) g.logs.push(log)
    else groups.set(key, { slot, logs: [log] })
  }

  const exercises: ExerciseSeries[] = []
  for (const [name, { slot, logs: groupLogs }] of groups) {
    const config = slotConfigFromRow(slot)
    const points: ExercisePoint[] = []
    let prevLog: SetLog | null = null

    for (const log of groupLogs) {
      const prev = derivePrevTargets(config, prevLog, log.week - 1, deloadWeek)
      const result = evaluateSlot(setLogInputFromRow(log), config, {
        week: log.week,
        deloadWeek,
        prevNextLoad: prev.prevNextLoad,
        prevNextSets: prev.prevNextSets,
        prevNextReps: prev.prevNextReps,
      })
      points.push({
        date: log.created_at,
        week: log.week,
        e1rm: result.e1rm,
        load: log.actual_load,
        reps: log.best_reps,
        sets: log.actual_sets,
        decision: result.decision,
        decisionLabel: result.decisionLabel,
        reason: result.reason,
      })
      prevLog = log
    }

    const e1rms = points
      .map((p) => p.e1rm)
      .filter((v): v is number => v != null)
    const loads = points
      .map((p) => p.load)
      .filter((v): v is number => v != null)

    const { stalled, reason } = detectStall(
      points.map((p) => ({ e1rm: p.e1rm, decision: p.decision }))
    )

    exercises.push({
      name,
      muscleArea: slot.muscle_area,
      logCount: groupLogs.length,
      points,
      stalled,
      stallReason: reason,
      latestE1rm: e1rms.length ? e1rms[e1rms.length - 1] : null,
      bestE1rm: e1rms.length ? Math.max(...e1rms) : null,
      latestLoad: loads.length ? loads[loads.length - 1] : null,
    })
  }

  if (exercises.length === 0) {
    return (
      <PageShell>
        <ProgressEmpty reason="no-logs" />
      </PageShell>
    )
  }

  // Most-logged lift first; it is also the default focus.
  exercises.sort((a, b) => b.logCount - a.logCount || a.name.localeCompare(b.name))
  const defaultExercise = exercises[0]?.name ?? null

  /* --- Tonnage per muscle area per week. --- */
  const OTHER = "Other"
  const muscleSet = new Set<string>()
  const byWeek = new Map<number, Record<string, number>>()
  for (const log of logs) {
    const slot = slotById.get(log.slot_id)
    if (!slot) continue
    if (log.actual_sets == null || log.best_reps == null || log.actual_load == null) {
      continue
    }
    const tonnage = log.actual_sets * log.best_reps * log.actual_load
    if (tonnage <= 0) continue
    const area = slot.muscle_area ?? OTHER
    muscleSet.add(area)
    const row = byWeek.get(log.week) ?? {}
    row[area] = (row[area] ?? 0) + tonnage
    byWeek.set(log.week, row)
  }

  const muscleAreas = [...muscleSet].sort()
  const volume: VolumeWeekRow[] = [...byWeek.keys()]
    .sort((a, b) => a - b)
    .map((week) => {
      const row: VolumeWeekRow = { week }
      for (const area of muscleAreas) row[area] = byWeek.get(week)?.[area] ?? 0
      return row
    })

  const data: ProgressData = {
    exercises,
    volume,
    muscleAreas,
    unit,
    defaultExercise,
  }

  return (
    <PageShell>
      <ProgressView data={data} />
    </PageShell>
  )
}

function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 pb-24 sm:py-8">
      <header className="mb-5 space-y-1">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
          simplegym
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Progress</h1>
        <p className="text-sm text-muted">
          Track e1RM, load, and volume per lift — and catch a stall early.
        </p>
      </header>
      {children}
    </div>
  )
}
