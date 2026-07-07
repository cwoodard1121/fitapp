/**
 * Deterministic analytics — PURE functions (no I/O). Given already-fetched rows,
 * compute the real numbers the AI layer interprets: per-lift e1RM trends/rates,
 * goal pacing/projections, body trajectory, muscle volume balance, nutrition
 * adherence, and mesocycle position.
 *
 * Pure and side-effect free so it can be unit-tested in isolation and run on the
 * server without pulling in the Supabase client. Every divide-by-zero and null
 * is guarded — sparse data (e.g. Week 1) returns nulls, never throws.
 */
import type {
  Block,
  BodyMetric,
  ExerciseSlot,
  Goal,
  NutritionLog,
  Program,
  SetLog,
} from '@/lib/types'
import type { Decision } from '@/lib/engine/engine'
import { evaluateSlot, detectStall } from '@/lib/engine/engine'
import {
  slotConfigFromRow,
  setLogInputFromRow,
  derivePrevTargets,
} from '@/lib/data/mappers'
import { weekForDate } from '@/lib/data/week'
import {
  blockFloorWeeklyRate,
  estimateBodyFatAtWeightFromLeanRetention,
  estimateBodyFatFromLeanRetention,
  normalizedBodyweight,
  normalizedChangeFromStart,
} from '@/lib/body/metrics'
import { computeProgress } from '@/components/goals/progress'

import type {
  BodyAnalytic,
  GoalAnalytic,
  LiftAnalytic,
  MesoAnalytic,
  MuscleVolumeAnalytic,
  NutritionAnalytic,
  TrainingAnalytics,
} from './types'

const MS_DAY = 24 * 60 * 60 * 1000
const MS_WEEK = 7 * MS_DAY

/** e1RM % change counted as flat (smaller -> 'flat' trend). */
const TREND_PCT = 1
/** Relative tolerance band around the required rate for on_track vs ahead/behind. */
const PACE_BUFFER = 0.1
/**
 * Minimum first->latest span (days) before an e1RM weekly rate is trustworthy.
 * Two sessions inside the same week/day otherwise yield a volatile, x7-amplified
 * rate that can wrongly flip an e1RM-backed goal to 'behind' in Week 1.
 */
const MIN_E1RM_RATE_DAYS = 7

/**
 * Water-weight de-noising. The first several days of a diet phase are mostly
 * glycogen + water flux ("whoosh" on a cut, the inverse on a bulk), not fat or
 * lean mass — so it must NOT drive rate-of-change / ETA math. We drop readings
 * within SETTLE_DAYS of the diet block start from the SLOPE fit, and require at
 * least MIN_CLEAN_DAYS of post-settle span before we trust a rate.
 *
 * Kept deliberately lenient: the 7-day centered smoothing (smooth7) already
 * damps day-to-day water noise, so a long blackout before showing ANY rate is
 * unnecessarily strict. One week of settle + ~10 days of clean span surfaces a
 * trustworthy trend in ~2.5 weeks instead of nearly a month.
 */
const SETTLE_DAYS = 7
const MIN_CLEAN_DAYS = 10

/* ------------------------------------------------------------------ */
/* Small numeric helpers (all null-guarded)                            */
/* ------------------------------------------------------------------ */

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
}

/** ms epoch for a date/timestamp string; NaN-safe callers guard on Number.isNaN. */
function ms(iso: string): number {
  return new Date(iso).getTime()
}

/** ms epoch for a plain `YYYY-MM-DD` date column, anchored to local midnight. */
function dayMs(date: string): number {
  return new Date(`${date.slice(0, 10)}T00:00:00`).getTime()
}

/** Whole weeks between two timestamps (absolute, >= 0). */
function weeksBetween(aIso: string, bIso: string): number {
  const a = ms(aIso)
  const b = ms(bIso)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.abs(b - a) / MS_WEEK
}

/**
 * Least-squares slope of value vs time, expressed per week. Returns null with
 * fewer than two points or zero time spread (a vertical fit has no slope).
 */
function weeklySlope(points: { t: number; v: number }[]): number | null {
  const pts = points.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
  if (pts.length < 2) return null
  const t0 = pts[0].t
  const xs = pts.map((p) => (p.t - t0) / MS_WEEK)
  const ys = pts.map((p) => p.v)
  const n = pts.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    den += (xs[i] - mx) ** 2
  }
  if (den === 0) return null
  return num / den
}

/* ------------------------------------------------------------------ */
/* Lift series — run the engine in week order (mirrors the Progress page) */
/* ------------------------------------------------------------------ */

interface LiftSeriesPoint {
  date: string
  week: number
  e1rm: number | null
  load: number | null
  reps: number | null
  decision: Decision
  decisionLabel: string
}

interface LiftSeries {
  name: string
  area: string | null
  isBodyweight: boolean
  points: LiftSeriesPoint[]
}

/**
 * Group set_logs by exercise_name and run the autoregulation engine over each
 * lift's logs in week order, carrying targets forward exactly as the Today /
 * Progress screens do. Produces a per-lift series of e1RM + decision points.
 */
function buildLiftSeries(
  slots: ExerciseSlot[],
  logs: SetLog[],
  deloadWeek: number,
): Map<string, LiftSeries> {
  const slotById = new Map<string, ExerciseSlot>(slots.map((s) => [s.id, s]))
  const groups = new Map<string, { slot: ExerciseSlot; logs: SetLog[] }>()
  for (const log of logs) {
    const slot = slotById.get(log.slot_id)
    if (!slot) continue
    const g = groups.get(slot.exercise_name)
    if (g) g.logs.push(log)
    else groups.set(slot.exercise_name, { slot, logs: [log] })
  }

  const series = new Map<string, LiftSeries>()
  for (const [name, { slot, logs: groupLogs }] of groups) {
    const config = slotConfigFromRow(slot)
    const points: LiftSeriesPoint[] = []
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
        decision: result.decision,
        decisionLabel: result.decisionLabel,
      })
      prevLog = log
    }
    series.set(name, {
      name,
      area: slot.muscle_area,
      isBodyweight: slot.is_bodyweight ?? false,
      points,
    })
  }
  return series
}

/** Collapse one lift's series into the LiftAnalytic readout. */
function toLiftAnalytic(s: LiftSeries): LiftAnalytic {
  const { points } = s
  const sessions = points.length

  const e1rmPts = points.filter(
    (p): p is LiftSeriesPoint & { e1rm: number } => p.e1rm != null,
  )
  const firstE1rm = e1rmPts.length ? round1(e1rmPts[0].e1rm) : null
  const latestE1rm = e1rmPts.length
    ? round1(e1rmPts[e1rmPts.length - 1].e1rm)
    : null

  const e1rmChange =
    firstE1rm != null && latestE1rm != null ? round1(latestE1rm - firstE1rm) : null
  const e1rmChangePct =
    firstE1rm != null && firstE1rm !== 0 && e1rmChange != null
      ? round1((e1rmChange / firstE1rm) * 100)
      : null

  let weeklyE1rmRate: number | null = null
  if (e1rmPts.length >= 2 && e1rmChange != null) {
    const wks = weeksBetween(e1rmPts[0].date, e1rmPts[e1rmPts.length - 1].date)
    // Require a real time base before reporting a weekly rate: below
    // MIN_E1RM_RATE_DAYS we report no rate yet (-> an e1RM goal stays 'no_data'
    // rather than reading 'behind' off two clustered early sessions).
    if (wks * 7 >= MIN_E1RM_RATE_DAYS) {
      weeklyE1rmRate = round2(e1rmChange / wks)
    }
  }

  const latestLoad =
    [...points].reverse().find((p) => p.load != null)?.load ?? null
  const latestReps =
    [...points].reverse().find((p) => p.reps != null)?.reps ?? null
  const last = points[points.length - 1]
  const lastDecision = last ? last.decisionLabel || null : null

  // Trend: prefer the e1RM series; for bodyweight lifts (load 0 -> e1RM null)
  // fall back to a reps trend. 'new' when there is too little to say.
  let trend: LiftAnalytic['trend'] = 'new'
  if (e1rmPts.length >= 2 && e1rmChangePct != null) {
    trend =
      e1rmChangePct > TREND_PCT
        ? 'up'
        : e1rmChangePct < -TREND_PCT
          ? 'down'
          : 'flat'
  } else if (s.isBodyweight) {
    const repPts = points.filter(
      (p): p is LiftSeriesPoint & { reps: number } => p.reps != null,
    )
    if (repPts.length >= 2) {
      const dr = repPts[repPts.length - 1].reps - repPts[0].reps
      trend = dr > 0 ? 'up' : dr < 0 ? 'down' : 'flat'
    }
  }

  const { stalled } = detectStall(
    points.map((p) => ({ e1rm: p.e1rm, decision: p.decision })),
  )

  return {
    exercise: s.name,
    muscleArea: s.area,
    isBodyweight: s.isBodyweight,
    sessions,
    firstE1rm,
    latestE1rm,
    e1rmChange,
    e1rmChangePct,
    weeklyE1rmRate,
    latestLoad,
    latestReps,
    trend,
    lastDecision,
    stalled,
  }
}

/**
 * Latest e1RM logged for a named lift, or null. Uses the most recent reading
 * (NOT the all-time max) so a goal's `current` shares one basis with its
 * first->latest endpoint rate — a peaked-then-regressed lift won't read an
 * optimistic ETA off a stale PR.
 */
function latestE1rmFor(series: Map<string, LiftSeries>, name: string | null): number | null {
  if (!name) return null
  const s = series.get(name)
  if (!s) return null
  return toLiftAnalytic(s).latestE1rm
}

/** Weekly e1RM rate for a named lift (same basis as the LiftAnalytic). */
function weeklyE1rmRateFor(
  series: Map<string, LiftSeries>,
  name: string | null,
): number | null {
  if (!name) return null
  const s = series.get(name)
  if (!s) return null
  return toLiftAnalytic(s).weeklyE1rmRate
}

/* ------------------------------------------------------------------ */
/* Goals — pacing, required/actual rates, projected ETA, status        */
/* ------------------------------------------------------------------ */

interface GoalContext {
  series: Map<string, LiftSeries>
  bodyMetrics: BodyMetric[]
  logs: SetLog[]
  dietBlock: Block | null
  recentTonnage: number | null
  now: Date
}

/** Latest non-null bodyweight / bodyfat across the readings (oldest -> newest). */
function latestBody(bodyMetrics: BodyMetric[], dietBlock: Block | null): {
  bodyweight: number | null
  bodyfat: number | null
} {
  const bodyweight = normalizedBodyweight(bodyMetrics, dietBlock).value
  let bodyfat: number | null = null
  const estimatedBodyfat = estimateBodyFatFromLeanRetention(bodyMetrics)
  const estimatedAtWeight =
    estimatedBodyfat.latest != null
      ? estimateBodyFatAtWeightFromLeanRetention(bodyMetrics, bodyweight)
      : null
  if (estimatedAtWeight != null) {
    bodyfat = estimatedAtWeight
  } else {
    for (const m of bodyMetrics) {
      if (m.bodyfat_pct != null) bodyfat = m.bodyfat_pct
    }
  }
  return { bodyweight, bodyfat }
}

/**
 * 7-day centered moving average over date-sorted points. Damps day-to-day
 * water-weight noise before the least-squares fit. O(n^2) but body readings are
 * few. Returns one smoothed point per input (same timestamps).
 */
function smooth7(points: { t: number; v: number }[]): { t: number; v: number }[] {
  const half = 3.5 * MS_DAY
  return points.map((p) => {
    const win = points.filter((q) => Math.abs(q.t - p.t) <= half)
    const avg = win.reduce((a, b) => a + b.v, 0) / win.length
    return { t: p.t, v: avg }
  })
}

interface BodyRate {
  /** units-per-week slope over the cleaned (post-settle) readings, or null. */
  rate: number | null
  /** true while still inside the early-diet water-weight settling window. */
  settling: boolean
}

/**
 * Robust weekly slope of a body metric with the early-diet water "whoosh"
 * excluded from the RATE fit only.
 *
 * Rationale: the start of a diet phase moves the scale fast for non-fat reasons
 * (glycogen + water). Anchored to the active diet block, we drop every reading
 * before settleEnd = start_date + SETTLE_DAYS from the slope fit — symmetrically
 * for cuts and bulks. With no diet block we keep the existing all-readings
 * behavior. Absolute change / current values are computed elsewhere over the
 * FULL set; only this rate uses the cleaned slope.
 *
 * Guard: with < 2 eligible readings or a post-settle span < MIN_CLEAN_DAYS we
 * can't trust a slope yet -> rate = null and settling = true (callers then read
 * 'no_data' rather than a contaminated rate).
 */
function bodyRate(
  bodyMetrics: BodyMetric[],
  key: 'bodyweight' | 'bodyfat_pct',
  dietBlock: Block | null,
): BodyRate {
  if (key === 'bodyweight' && dietBlock?.phase === 'cut') {
    return blockFloorWeeklyRate(bodyMetrics, dietBlock, {
      settleDays: SETTLE_DAYS,
      minSpanDays: MIN_CLEAN_DAYS,
    })
  }

  const all = bodyMetrics
    .map((m) => ({ t: dayMs(m.measured_on), v: m[key] }))
    .filter((p): p is { t: number; v: number } => p.v != null && Number.isFinite(p.t))

  // Only the eligible window differs between the diet / no-diet cases: a diet
  // anchor drops readings inside the early-diet water "whoosh". Everything after
  // (smooth7 + the min-points / min-span guard) is applied IDENTICALLY so two
  // close early readings can't produce a rate just because no diet is active.
  const settleStart = dietBlock?.start_date ? dayMs(dietBlock.start_date) : NaN
  const hasDiet = !Number.isNaN(settleStart)
  // bodyMetrics arrive oldest -> newest, so `eligible` stays sorted ascending.
  const eligible = hasDiet
    ? all.filter((p) => p.t >= settleStart + SETTLE_DAYS * MS_DAY)
    : all

  const spanDays =
    eligible.length >= 2
      ? (eligible[eligible.length - 1].t - eligible[0].t) / MS_DAY
      : 0
  if (eligible.length < 2 || spanDays < MIN_CLEAN_DAYS) {
    // Not enough clean span to trust a slope. With a diet active this is the
    // early-diet settling window (flag it so the UI can say so); otherwise it is
    // simply thin data.
    return { rate: null, settling: hasDiet }
  }

  const slope = weeklySlope(smooth7(eligible))
  return { rate: slope == null ? null : round2(slope), settling: false }
}

/**
 * Per-week total tonnage points (time-anchored to each week's latest session)
 * for volume-goal pacing. Lets a volume goal show a real weekly slope instead of
 * falling through to a misleading status.
 */
function weeklyTonnagePoints(logs: SetLog[]): { t: number; v: number }[] {
  const byWeek = new Map<number, { v: number; t: number }>()
  for (const log of logs) {
    if (log.actual_load == null || log.best_reps == null || log.actual_sets == null) continue
    const tonnage = log.actual_load * log.best_reps * log.actual_sets
    if (tonnage <= 0) continue
    const t = ms(log.created_at)
    if (Number.isNaN(t)) continue
    const cur = byWeek.get(log.week)
    if (cur) {
      cur.v += tonnage
      if (t > cur.t) cur.t = t
    } else {
      byWeek.set(log.week, { v: tonnage, t })
    }
  }
  return [...byWeek.values()].sort((a, b) => a.t - b.t).map((p) => ({ t: p.t, v: p.v }))
}

function computeGoal(goal: Goal, ctx: GoalContext): GoalAnalytic {
  const { series, bodyMetrics, logs, dietBlock, recentTonnage, now } = ctx
  const body = latestBody(bodyMetrics, dietBlock)

  /* --- Current value by metric type --- */
  let current: number | null = null
  let actualWeeklyRate: number | null = null
  switch (goal.metric_type) {
    case 'bodyweight':
      // Cut current uses the block floor; the rate uses the same floor basis
      // after the early-diet settling window.
      current = body.bodyweight
      actualWeeklyRate = bodyRate(bodyMetrics, 'bodyweight', dietBlock).rate
      break
    case 'bodyfat':
      current = body.bodyfat
      actualWeeklyRate = bodyRate(bodyMetrics, 'bodyfat_pct', dietBlock).rate
      break
    case 'e1rm':
      // Latest (not max) e1RM so `current` shares the endpoint-rate basis (#3).
      current = latestE1rmFor(series, goal.exercise_name)
      actualWeeklyRate = weeklyE1rmRateFor(series, goal.exercise_name)
      break
    case 'volume': {
      current = recentTonnage
      // A real weekly tonnage slope over the recent weeks (last ~6) so volume
      // goals pace off data instead of defaulting to 'behind'.
      const slope = weeklySlope(weeklyTonnagePoints(logs).slice(-6))
      actualWeeklyRate = slope == null ? null : round2(slope)
      break
    }
    default:
      current = null
  }

  const start = goal.start_value
  const target = goal.target_value
  const unit = goal.target_unit
  const targetDate = goal.target_date

  const prog = computeProgress(start, current, target)
  const pctComplete = prog ? round1(prog.pct) : null

  /* --- Deadline-relative numbers --- */
  const nowMs = now.getTime()
  let daysToTarget: number | null = null
  let requiredWeeklyRate: number | null = null
  if (targetDate) {
    const tMs = dayMs(targetDate)
    if (!Number.isNaN(tMs)) {
      daysToTarget = Math.round((tMs - nowMs) / MS_DAY)
      const weeksLeft = (tMs - nowMs) / MS_WEEK
      if (weeksLeft > 0 && current != null && target != null) {
        requiredWeeklyRate = round2((target - current) / weeksLeft)
      }
    }
  }

  /* --- Projected ETA at the observed rate --- */
  let projectedEta: string | null = null
  if (current != null && target != null && actualWeeklyRate != null && Math.abs(actualWeeklyRate) > 1e-9) {
    const remaining = target - current
    if (Math.sign(remaining) === Math.sign(actualWeeklyRate)) {
      const weeksToTarget = remaining / actualWeeklyRate
      const eta = new Date(nowMs + weeksToTarget * MS_WEEK)
      if (!Number.isNaN(eta.getTime())) projectedEta = eta.toISOString().slice(0, 10)
    }
  }

  /* --- Status: achieved / ahead / on_track / behind / no_data --- */
  let status: GoalAnalytic['status'] = 'no_data'
  if (current != null && target != null) {
    const remaining = target - current
    const dir = start != null ? Math.sign(target - start) || Math.sign(remaining) : Math.sign(remaining)
    const reached = dir >= 0 ? current >= target : current <= target
    if (reached) {
      status = 'achieved'
    } else if (actualWeeklyRate == null) {
      // No observed rate yet — Week 1, the early-diet settling window, a volume
      // goal without enough weeks, or a lift with no series. A non-null
      // requiredWeeklyRate (merely having a deadline) must NOT force 'behind';
      // a brand-new goal reads 'no_data' until a real actual rate exists.
      status = 'no_data'
    } else {
      const movingRight =
        Math.sign(actualWeeklyRate) === (dir || Math.sign(remaining)) &&
        Math.abs(actualWeeklyRate) > 1e-9
      if (!movingRight) {
        status = 'behind'
      } else if (requiredWeeklyRate == null) {
        status = 'on_track'
      } else {
        const ratio = Math.abs(actualWeeklyRate) / Math.max(Math.abs(requiredWeeklyRate), 1e-9)
        status = ratio >= 1 + PACE_BUFFER ? 'ahead' : ratio >= 1 - PACE_BUFFER ? 'on_track' : 'behind'
      }
    }
  }

  return {
    id: goal.id,
    title: goal.title,
    metricType: goal.metric_type,
    start: start ?? null,
    current: current == null ? null : round1(current),
    target: target ?? null,
    unit: unit ?? null,
    pctComplete,
    targetDate: targetDate ?? null,
    daysToTarget,
    requiredWeeklyRate,
    actualWeeklyRate,
    projectedEta,
    status,
  }
}

/* ------------------------------------------------------------------ */
/* Body, volume, nutrition, meso                                       */
/* ------------------------------------------------------------------ */

function computeBody(bodyMetrics: BodyMetric[], dietBlock: Block | null): BodyAnalytic {
  const bf = bodyMetrics.filter(
    (m): m is BodyMetric & { bodyfat_pct: number } => m.bodyfat_pct != null,
  )

  // In a cut, top-line dashboard weight uses the block floor so a high-water
  // morning does not move every card. Raw readings still render in history/charts.
  const normalizedWeight = normalizedBodyweight(bodyMetrics, dietBlock)
  const latestWeight = normalizedWeight.value
  const weightChange = normalizedChangeFromStart(bodyMetrics, dietBlock)
  const { rate: weeklyRate, settling } = bodyRate(bodyMetrics, 'bodyweight', dietBlock)

  const estimatedBodyfat = estimateBodyFatFromLeanRetention(bodyMetrics)
  const normalizedEstimatedBodyfat = estimateBodyFatAtWeightFromLeanRetention(
    bodyMetrics,
    normalizedWeight.value,
  )
  const estimatedBodyfatChange =
    estimatedBodyfat.points.length >= 1 && normalizedEstimatedBodyfat != null
      ? round1(normalizedEstimatedBodyfat - estimatedBodyfat.points[0].bodyfat)
      : null
  const latestMeasuredBodyfat = bf.length ? round1(bf[bf.length - 1].bodyfat_pct) : null
  const measuredBodyfatChange =
    bf.length >= 2 ? round1(bf[bf.length - 1].bodyfat_pct - bf[0].bodyfat_pct) : null
  const useEstimatedBodyfat = normalizedEstimatedBodyfat != null
  const latestBodyfat = useEstimatedBodyfat ? normalizedEstimatedBodyfat : latestMeasuredBodyfat
  const bodyfatChange = useEstimatedBodyfat ? estimatedBodyfatChange : measuredBodyfatChange

  return {
    latestWeight,
    weightBasis: normalizedWeight.basis,
    weightChange,
    weeklyRate,
    latestBodyfat,
    bodyfatBasis: useEstimatedBodyfat
      ? 'estimated'
      : latestMeasuredBodyfat == null
        ? 'none'
        : 'measured',
    bodyfatChange,
    readings: bodyMetrics.length,
    settling,
  }
}

/**
 * Weekly sets + tonnage per muscle area from the MOST RECENT logged week. Pins
 * to the latest log's week number and a ~10-day window off the latest session
 * so a same-numbered week from a prior mesocycle can't bleed in.
 */
function computeVolume(slots: ExerciseSlot[], logs: SetLog[]): MuscleVolumeAnalytic[] {
  if (logs.length === 0) return []
  const slotById = new Map<string, ExerciseSlot>(slots.map((s) => [s.id, s]))

  let latest = logs[0]
  for (const l of logs) if (ms(l.created_at) > ms(latest.created_at)) latest = l
  const targetWeek = latest.week
  const latestMs = ms(latest.created_at)
  const windowMs = 10 * MS_DAY

  const byMuscle = new Map<string, { sets: number; tonnage: number }>()
  for (const log of logs) {
    if (log.week !== targetWeek) continue
    if (latestMs - ms(log.created_at) > windowMs) continue
    const slot = slotById.get(log.slot_id)
    if (!slot) continue
    const area = slot.muscle_area ?? 'Other'
    const sets = log.actual_sets ?? 0
    const tonnage =
      log.actual_sets != null && log.best_reps != null && log.actual_load != null
        ? log.actual_sets * log.best_reps * log.actual_load
        : 0
    const cur = byMuscle.get(area) ?? { sets: 0, tonnage: 0 }
    cur.sets += sets
    cur.tonnage += tonnage
    byMuscle.set(area, cur)
  }

  return [...byMuscle.entries()]
    .filter(([, v]) => v.sets > 0 || v.tonnage > 0)
    .map(([muscle, v]) => ({
      muscle,
      weeklySets: v.sets,
      weeklyTonnage: Math.round(v.tonnage),
    }))
    .sort((a, b) => a.muscle.localeCompare(b.muscle))
}

function computeNutrition(
  nutrition: NutritionLog[],
  dietBlock: Block | null,
): NutritionAnalytic {
  const recent = [...nutrition]
    .sort((a, b) => b.logged_on.localeCompare(a.logged_on))
    .slice(0, 14)

  const cals = recent
    .map((n) => n.calories)
    .filter((v): v is number => v != null)
  const prot = recent
    .map((n) => n.protein)
    .filter((v): v is number => v != null)

  const avgCals = mean(cals)
  const avgProt = mean(prot)
  const avgCalories = avgCals == null ? null : Math.round(avgCals)
  const avgProtein = avgProt == null ? null : Math.round(avgProt)
  const calorieTarget = dietBlock?.calorie_target ?? null
  const proteinTarget = dietBlock?.protein_target ?? null

  let adherencePct: number | null = null
  if (avgCalories != null && calorieTarget != null && calorieTarget > 0) {
    const dev = Math.abs(avgCalories - calorieTarget) / calorieTarget
    adherencePct = Math.round(Math.max(0, 1 - dev) * 100)
  }

  return {
    daysLogged: recent.length,
    avgCalories,
    calorieTarget,
    avgProtein,
    proteinTarget,
    adherencePct,
  }
}

function computeMeso(program: Program | null, now: Date): MesoAnalytic {
  if (!program) {
    return {
      programName: '',
      week: 1,
      lengthWeeks: 0,
      weeksLeft: 0,
      deloadWeek: 0,
      isDeloadThisWeek: false,
    }
  }
  const lengthWeeks = program.length_weeks
  const week = weekForDate(program.start_date, lengthWeeks, now)
  return {
    programName: program.name,
    week,
    lengthWeeks,
    weeksLeft: Math.max(0, lengthWeeks - week),
    deloadWeek: program.deload_week,
    isDeloadThisWeek: week === program.deload_week,
  }
}

/** Last-7-day tonnage across all logs — the live "current" for volume goals. */
function recentTonnage(logs: SetLog[], now: Date): number | null {
  const since = now.getTime() - 7 * MS_DAY
  let sum = 0
  let any = false
  for (const log of logs) {
    if (ms(log.created_at) < since) continue
    if (log.actual_load == null || log.best_reps == null || log.actual_sets == null) {
      continue
    }
    sum += log.actual_load * log.best_reps * log.actual_sets
    any = true
  }
  return any ? Math.round(sum) : null
}

/* ------------------------------------------------------------------ */
/* Orchestrator                                                        */
/* ------------------------------------------------------------------ */

/** Already-fetched rows + a clock, scoped to one user, in stable order. */
export interface AnalyticsInput {
  now: Date
  program: Program | null
  slots: ExerciseSlot[]
  /** All set_logs, oldest -> newest (week asc, created_at asc). */
  logs: SetLog[]
  goals: Goal[]
  /** body_metrics oldest -> newest. */
  bodyMetrics: BodyMetric[]
  nutrition: NutritionLog[]
  dietBlock: Block | null
}

/**
 * Compute the full TrainingAnalytics bundle from already-fetched rows. Pure:
 * deterministic in `input`, no I/O. Returns empty arrays / null fields when
 * there is no data, so it is useful even in Week 1 with thin history.
 */
export function computeAnalytics(input: AnalyticsInput): TrainingAnalytics {
  const { now, program, slots, logs, goals, bodyMetrics, nutrition, dietBlock } = input
  const deloadWeek = program?.deload_week ?? 0

  const series = buildLiftSeries(slots, logs, deloadWeek)
  const lifts = [...series.values()]
    .map(toLiftAnalytic)
    .sort((a, b) => b.sessions - a.sessions || a.exercise.localeCompare(b.exercise))

  const tonnage = recentTonnage(logs, now)
  const goalCtx: GoalContext = {
    series,
    bodyMetrics,
    logs,
    dietBlock,
    recentTonnage: tonnage,
    now,
  }
  // Active goals first, then newest-created — mirrors the Progress / Goals pages.
  const sortedGoals = [...goals].sort((a, b) => {
    const aw = a.status === 'active' ? 0 : 1
    const bw = b.status === 'active' ? 0 : 1
    if (aw !== bw) return aw - bw
    return b.created_at.localeCompare(a.created_at)
  })
  const goalAnalytics = sortedGoals.map((g) => computeGoal(g, goalCtx))

  return {
    meso: computeMeso(program, now),
    lifts,
    goals: goalAnalytics,
    body: computeBody(bodyMetrics, dietBlock),
    volume: computeVolume(slots, logs),
    nutrition: computeNutrition(nutrition, dietBlock),
  }
}
