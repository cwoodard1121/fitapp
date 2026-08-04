import type { Metadata } from "next"
import type { ReactNode } from "react"
import { addDays, format, parseISO } from "date-fns"

import type {
  Block,
  BodyMetric,
  ExerciseSlot,
  Goal,
  Session,
  SetLog,
  Unit,
} from "@/lib/types"
import {
  getActiveProgram,
  getProfile,
  requireUserId,
  slotConfigFromRow,
  setLogInputFromRow,
} from "@/lib/data"
import { evaluateSlot, detectStall } from "@/lib/engine/engine"
import { createClient } from "@/lib/supabase/server"
import { getAnalysisAccess } from "@/lib/ai/allowlist"
import { getLatestAnalysis } from "@/lib/ai/analysis"
import { gatherAnalytics } from "@/lib/analytics"
import { attachNextDaySorenessToLogs } from "@/lib/data/soreness"
import {
  attachSessionContextToLogs,
  canCarryProgression,
  hasExerciseHistorySignal,
  trainingLogTimestamp,
  trainingWeekKey,
} from "@/lib/data/training-history"
import {
  estimateBodyFatFromLeanRetention,
  normalizedBodyweight,
  normalizedChangeFromStart,
} from "@/lib/body/metrics"
import {
  interpretBodyMetrics,
  latestBodyFatInterpretation,
} from "@/lib/body/body-fat"
import { exerciseNameKey } from "@/lib/exercises/identity"

import { AnalysisPanel } from "@/components/analysis/analysis-panel"
import { AnalyticsOverview } from "@/components/progress/analytics-overview"
import { ProgressView, ProgressEmpty } from "@/components/progress/progress-view"
import type {
  BodyTrendPoint,
  ExercisePoint,
  ExerciseSeries,
  GoalProgressRow,
  ProgressBlockOverlay,
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

  // All exercise identities and session-timed logs, including retired slots
  // and archived programs, keep grandfathered progress available to charts/AI.
  const supabase = await createClient()
  const userId = await requireUserId(supabase)
  const [slotResult, logResult, sessionResult] = await Promise.all([
    supabase.from("exercise_slots").select("*").eq("user_id", userId),
    supabase.from("set_logs").select("*").eq("user_id", userId),
    supabase.from("sessions").select("*").eq("user_id", userId),
  ])
  if (slotResult.error) throw slotResult.error
  if (logResult.error) throw logResult.error
  if (sessionResult.error) throw sessionResult.error
  const slots = (slotResult.data as ExerciseSlot[]) ?? []
  const slotById = new Map<string, ExerciseSlot>(slots.map((s) => [s.id, s]))
  const timedLogs = attachSessionContextToLogs(
    (logResult.data as SetLog[]) ?? [],
    (sessionResult.data as Session[]) ?? [],
  )
  const logs = await attachNextDaySorenessToLogs(
    supabase,
    userId,
    timedLogs,
    slots,
  )
  const exerciseLogs = logs.filter(hasExerciseHistorySignal)

  // Goals + body measurements feed the new progress sections. Both are
  // RLS-scoped; we also pin user_id explicitly.
  const [{ data: goalRows }, { data: bodyRows }, { data: blockRows }] =
    await Promise.all([
      supabase.from("goals").select("*").eq("user_id", userId),
      supabase
        .from("body_metrics")
        .select("*")
        .eq("user_id", userId)
        .order("measured_on", { ascending: true }),
      supabase
        .from("blocks")
        .select("*")
        .eq("user_id", userId)
        .order("start_date", { ascending: false })
    ])
  const goalsRaw = (goalRows as Goal[]) ?? []
  const bodyMetrics = (bodyRows as BodyMetric[]) ?? []
  const interpretedBodyMetrics = interpretBodyMetrics(bodyMetrics)
  const blocks = (blockRows as Block[]) ?? []
  const activeDietBlock =
    blocks.find(
      (block) =>
        block.kind === "diet" &&
        block.is_active &&
        block.completed_at == null,
    ) ?? null
  const blockOverlays: ProgressBlockOverlay[] = blocks.flatMap((block) => {
    if (!block.start_date) return []
    const endDate =
      block.end_date ??
      (block.length_weeks != null && block.length_weeks > 0
        ? format(
            addDays(parseISO(block.start_date), block.length_weeks * 7 - 1),
            "yyyy-MM-dd",
          )
        : null)
    if (!endDate) return []
    return [
      {
        id: block.id,
        name: block.name,
        kind: block.kind,
        phase: block.phase,
        startDate: block.start_date,
        endDate,
        isActive: block.is_active,
        completedAt: block.completed_at,
      },
    ]
  })

  const deloadWeek = program.deload_week

  /* --- Group logs by exercise_name and run the engine in sequence. --- */
  const groups = new Map<
    string,
    {
      name: string
      slot: ExerciseSlot
      logs: { log: SetLog; slot: ExerciseSlot }[]
    }
  >()
  for (const log of exerciseLogs) {
    const slot = slotById.get(log.slot_id)
    if (!slot) continue
    const key = exerciseNameKey(slot.exercise_name)
    const g = groups.get(key)
    if (g) {
      g.name = slot.exercise_name
      g.slot = slot
      g.logs.push({ log, slot })
    } else {
      groups.set(key, {
        name: slot.exercise_name,
        slot,
        logs: [{ log, slot }],
      })
    }
  }

  const exercises: ExerciseSeries[] = []
  for (const { name, slot, logs: groupLogs } of groups.values()) {
    const points: ExercisePoint[] = []
    let previousResult: ReturnType<typeof evaluateSlot> | null = null

    for (const { log, slot: historicalSlot } of groupLogs) {
      const config = slotConfigFromRow(historicalSlot)
      const result = evaluateSlot(setLogInputFromRow(log), config, {
        week: log.week,
        deloadWeek,
        prevNextLoad: previousResult?.nextLoad,
        prevNextSets: previousResult?.nextSets,
        prevNextReps: previousResult?.nextReps,
        prescribedLoad: log.target_load,
        prescribedSets: log.target_sets,
        prescribedReps: log.target_reps,
        prescribedRir: log.target_rir,
        weights: profile?.readiness_weights ?? undefined,
      })
      points.push({
        date: trainingLogTimestamp(log),
        week: log.week,
        e1rm: result.e1rm,
        load: log.actual_load,
        reps: log.best_reps,
        sets: log.actual_sets,
        decision: result.decision,
        decisionLabel: result.decisionLabel,
        reason: result.reason,
      })
      if (canCarryProgression(log)) previousResult = result
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
  const bodyFatBlockStartDate = activeDietBlock?.start_date ?? null
  const estimatedBodyfat = bodyFatBlockStartDate
    ? estimateBodyFatFromLeanRetention(
        interpretedBodyMetrics,
        { start_date: bodyFatBlockStartDate },
      )
    : null
  const estimatedBodyfatByDate = new Map(
    (estimatedBodyfat?.points ?? []).map((p) => [p.date, p.bodyfat]),
  )
  const body: BodyTrendPoint[] = interpretedBodyMetrics.map((m) => ({
    date: m.measured_on,
    bodyweight: m.bodyweight,
    bodyfat: m.bodyfat_pct,
    estimatedBodyfat: estimatedBodyfatByDate.get(m.measured_on) ?? null,
  }))

  /* --- Derive each goal's live "current" value where we can. --- */
  const bestE1rmByName = new Map(exercises.map((e) => [exerciseNameKey(e.name), e.bestE1rm]))
  const latestBodyfat = latestBodyFatInterpretation(bodyMetrics)?.bodyfatPct ?? null
  const normalizedBody = normalizedBodyweight(bodyMetrics, activeDietBlock)
  const normalizedBodyChange = normalizedChangeFromStart(bodyMetrics, activeDietBlock)

  // Recent weekly tonnage (last 7 days) for volume goals; null when no data.
  const since = Date.now() - 7 * 24 * 60 * 60 * 1000
  let recentTonnage: number | null = null
  {
    let sum = 0
    let any = false
    for (const log of logs) {
      if (new Date(trainingLogTimestamp(log)).getTime() < since) continue
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
          current = latestBodyfat
          break
        case "e1rm":
          current = g.exercise_name
            ? bestE1rmByName.get(exerciseNameKey(g.exercise_name)) ?? null
            : null
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
  const byWeek = new Map<
    string,
    { week: number; time: number; values: Record<string, number> }
  >()
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
    const key = trainingWeekKey(log)
    const time = new Date(trainingLogTimestamp(log)).getTime()
    const bucket = byWeek.get(key) ?? {
      week: log.week,
      time: Number.isNaN(time) ? 0 : time,
      values: {},
    }
    bucket.values[area] = (bucket.values[area] ?? 0) + tonnage
    if (!Number.isNaN(time) && time > bucket.time) bucket.time = time
    byWeek.set(key, bucket)
  }

  const muscleAreas = [...muscleSet].sort()
  const volume: VolumeWeekRow[] = [...byWeek.values()]
    .sort((a, b) => a.time - b.time)
    .map((bucket) => {
      const row: VolumeWeekRow = { week: bucket.week }
      for (const area of muscleAreas) row[area] = bucket.values[area] ?? 0
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
    blockOverlays,
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
