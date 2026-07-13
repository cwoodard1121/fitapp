import type { Metadata } from "next"
import type { ReactNode } from "react"

import type { BaselineLift, Block, BodyMetric, ExerciseSlot, Goal, SetLog, Unit } from "@/lib/types"
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
import { getAnalysisAccess } from "@/lib/ai/allowlist"
import { getLatestAnalysis } from "@/lib/ai/analysis"
import { gatherAnalytics } from "@/lib/analytics"
import {
  estimateBodyFatFromLeanRetention,
  normalizedBodyweight,
  normalizedChangeFromStart,
  type StrengthEstimatePoint,
} from "@/lib/body/metrics"

import { AnalysisPanel } from "@/components/analysis/analysis-panel"
import { AnalyticsOverview } from "@/components/progress/analytics-overview"
import { ProgressView, ProgressEmpty } from "@/components/progress/progress-view"
import type {
  BodyTrendPoint,
  ExercisePoint,
  ExerciseSeries,
  GoalProgressRow,
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

  // Goals + body measurements feed the new progress sections. Both are
  // RLS-scoped; we also pin user_id explicitly.
  const [{ data: goalRows }, { data: bodyRows }, { data: blockRows }, { data: baselineRows }] =
    await Promise.all([
      supabase.from("goals").select("*").eq("user_id", userId),
      supabase
        .from("body_metrics")
        .select("*")
        .eq("user_id", userId)
        .order("measured_on", { ascending: true }),
      supabase
        .from("blocks")
        .select("phase,start_date")
        .eq("user_id", userId)
        .eq("kind", "diet")
        .eq("is_active", true)
        .order("start_date", { ascending: false })
        .limit(1),
      supabase.from("baseline_lifts").select("*").eq("user_id", userId),
    ])
  const goalsRaw = (goalRows as Goal[]) ?? []
  const bodyMetrics = (bodyRows as BodyMetric[]) ?? []
  const baselineLifts = (baselineRows as BaselineLift[]) ?? []
  const activeDietBlock =
    (blockRows?.[0] as Pick<Block, "phase" | "start_date"> | undefined) ?? null

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

  /* --- Body measurements, oldest -> newest. --- */
  const today = new Date().toISOString().slice(0, 10)
  const loggedStrengthPoints: StrengthEstimatePoint[] = exercises.flatMap((exercise) =>
    exercise.points
      .filter((point) => point.e1rm != null)
      .map((point) => ({
        date: point.date.slice(0, 10),
        exerciseName: exercise.name,
        e1rm: point.e1rm,
        source: "logged",
      })),
  )
  const baselineStrengthPoints: StrengthEstimatePoint[] = baselineLifts.map((lift) => ({
    date: lift.lifted_on ?? today,
    exerciseName: lift.exercise_name,
    e1rm: Number(lift.e1rm),
    source: "baseline",
  }))
  const strengthPoints = [...loggedStrengthPoints, ...baselineStrengthPoints]
  const bodyFatBlockStartDate = activeDietBlock?.start_date ?? null
  const estimatedBodyfat = bodyFatBlockStartDate
    ? estimateBodyFatFromLeanRetention(
        bodyMetrics,
        { start_date: bodyFatBlockStartDate },
        profile?.bodyfat_lift_compensation ? strengthPoints : undefined,
      )
    : null
  const estimatedBodyfatByDate = new Map(
    (estimatedBodyfat?.points ?? []).map((p) => [p.date, p.bodyfat]),
  )
  const body: BodyTrendPoint[] = bodyMetrics.map((m) => ({
    date: m.measured_on,
    bodyweight: m.bodyweight,
    bodyfat: m.bodyfat_pct,
    estimatedBodyfat: estimatedBodyfatByDate.get(m.measured_on) ?? null,
  }))

  /* --- Derive each goal's live "current" value where we can. --- */
  const bestE1rmByName = new Map(exercises.map((e) => [e.name, e.bestE1rm]))
  const latestBody = bodyMetrics.length ? bodyMetrics[bodyMetrics.length - 1] : null
  const normalizedBody = normalizedBodyweight(bodyMetrics, activeDietBlock)
  const normalizedBodyChange = normalizedChangeFromStart(bodyMetrics, activeDietBlock)

  // Recent weekly tonnage (last 7 days) for volume goals; null when no data.
  const since = Date.now() - 7 * 24 * 60 * 60 * 1000
  let recentTonnage: number | null = null
  {
    let sum = 0
    let any = false
    for (const log of logs) {
      if (new Date(log.created_at).getTime() < since) continue
      if (log.actual_load == null || log.best_reps == null || log.actual_sets == null) {
        continue
      }
      sum += log.actual_load * log.best_reps * log.actual_sets
      any = true
    }
    recentTonnage = any ? sum : null
  }

  const goals: GoalProgressRow[] = goalsRaw
    .map((g): GoalProgressRow => {
      let current: number | null = null
      switch (g.metric_type) {
        case "bodyweight":
          current = normalizedBody.value
          break
        case "bodyfat":
          current = latestBody?.bodyfat_pct ?? null
          break
        case "e1rm":
          current = g.exercise_name ? bestE1rmByName.get(g.exercise_name) ?? null : null
          break
        case "volume":
          current = recentTonnage
          break
        default:
          current = null
      }
      return {
        id: g.id,
        title: g.title,
        metricType: g.metric_type,
        exerciseName: g.exercise_name,
        startValue: g.start_value,
        current,
        targetValue: g.target_value,
        targetUnit: g.target_unit,
        targetDate: g.target_date,
        createdAt: g.created_at,
        status: g.status,
      }
    })
    // Active goals first, then newest-created.
    .sort((a, b) => {
      const aw = a.status === "active" ? 0 : 1
      const bw = b.status === "active" ? 0 : 1
      if (aw !== bw) return aw - bw
      return b.createdAt.localeCompare(a.createdAt)
    })

  // Deterministic analytics are ALWAYS computable (even in Week 1) and need no
  // allowlist. The AI overview sits on top, gated to allowed accounts; the panel
  // renders null itself when not allowed, so it is safe to always include.
  const analytics = await gatherAnalytics()
  const { allowed } = await getAnalysisAccess()
  const analysis = allowed ? await getLatestAnalysis() : null

  // Mirror the Goals page: the analytics overview shows ACTIVE goals only, not
  // abandoned / achieved / no-data lifecycle goals. Build the active id set from
  // the goals query (status is on each row) and filter the computed pacing.
  const activeGoalIds = new Set(
    goalsRaw.filter((g) => g.status === "active").map((g) => g.id),
  )
  const overviewAnalytics = {
    ...analytics,
    goals: analytics.goals.filter((g) => activeGoalIds.has(g.id)),
  }

  // Brand-new user with nothing to chart anywhere: still surface the analytics
  // (mesocycle position, goal pacing, required rates) and the AI overview above
  // the empty-state nudge — there is always something concrete to show.
  if (exercises.length === 0 && goals.length === 0 && body.length === 0) {
    return (
      <PageShell>
        <div className="space-y-6">
          <AnalyticsOverview analytics={overviewAnalytics} unit={unit} />
          <AnalysisPanel analysis={analysis} allowed={allowed} />
          <ProgressEmpty reason="no-logs" />
        </div>
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
    goals,
    body,
    bodyWeightCurrent: normalizedBody.value,
    bodyWeightRawLatest: normalizedBody.rawLatest,
    bodyWeightBasis: normalizedBody.basis,
    bodyWeightChange: normalizedBodyChange,
    bodyFatBlockStartDate,
  }

  return (
    <PageShell>
      <div className="space-y-6">
        <AnalyticsOverview analytics={overviewAnalytics} unit={unit} />
        <AnalysisPanel analysis={analysis} allowed={allowed} />
        <ProgressView data={data} />
      </div>
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
