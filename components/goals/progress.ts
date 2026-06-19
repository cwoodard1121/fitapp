import type { GoalMetricType } from '@/lib/types'

/**
 * Compute progress along start -> current -> target. Works in both directions
 * (a cut where target < start, or a strength goal where target > start) because
 * it measures distance travelled toward the target as a fraction of the total
 * gap. Returns null when there isn't enough data to draw a bar.
 */
export function computeProgress(
  start: number | null,
  current: number | null,
  target: number | null,
): { pct: number; remaining: number | null } | null {
  if (start == null || target == null || current == null) return null
  const span = target - start
  if (span === 0) {
    // Already at/!=target with no span — treat as done if matched.
    return { pct: current === target ? 100 : 0, remaining: 0 }
  }
  const travelled = current - start
  const ratio = travelled / span
  const pct = Math.max(0, Math.min(100, ratio * 100))
  return { pct, remaining: target - current }
}

export type PaceStatus = 'reached' | 'ahead' | 'on-track' | 'behind' | 'stalled'

export interface Pacing {
  /** Rate still needed from now to hit target by the date (per week, signed). */
  requiredPerWeek: number | null
  /** Your actual rate so far (per week, signed). */
  actualPerWeek: number | null
  /** Projected arrival date at the current actual rate (ISO), or null. */
  projectedDate: string | null
  /** Whole weeks left until the target date (may be negative if overdue). */
  weeksLeft: number
  status: PaceStatus
}

const MS_WEEK = 7 * 24 * 60 * 60 * 1000

/**
 * Pace a goal toward its target date using only the goal's own numbers — the
 * starting value (set when the goal was created), the current value, the target,
 * the created_at timestamp, and the target date. No time series required.
 *
 * Works for cuts (target < start) and gains (target > start): it reasons about
 * "distance still to travel" and "rate travelled so far" with sign awareness, so
 * a bodyfat goal trending the right way reads as on-track even mid-journey.
 */
export function computePacing(
  startValue: number | null,
  current: number | null,
  targetValue: number | null,
  createdAt: string,
  targetDate: string | null,
  now: Date = new Date(),
): Pacing | null {
  if (startValue == null || current == null || targetValue == null) return null
  if (!targetDate) return null

  const created = new Date(createdAt)
  const target = new Date(`${targetDate.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(created.getTime()) || Number.isNaN(target.getTime())) return null

  const totalGap = targetValue - startValue // signed direction we want to move
  const remaining = targetValue - current
  const dir = Math.sign(totalGap) || Math.sign(remaining) || 1

  // Already there (reached or passed the target in the intended direction).
  const reached = dir > 0 ? current >= targetValue : current <= targetValue
  const weeksLeft = (target.getTime() - now.getTime()) / MS_WEEK

  if (reached) {
    return { requiredPerWeek: 0, actualPerWeek: null, projectedDate: null, weeksLeft, status: 'reached' }
  }

  const weeksElapsed = Math.max((now.getTime() - created.getTime()) / MS_WEEK, 1 / 7)
  const actualPerWeek = (current - startValue) / weeksElapsed
  const requiredPerWeek = weeksLeft > 0 ? remaining / weeksLeft : null

  // Are we actually moving toward the target?
  const movingRight = Math.sign(actualPerWeek) === dir && Math.abs(actualPerWeek) > 1e-9

  let projectedDate: string | null = null
  let status: PaceStatus
  if (!movingRight) {
    status = 'stalled'
  } else {
    const weeksToTarget = remaining / actualPerWeek // both signed same way -> positive
    const eta = new Date(now.getTime() + weeksToTarget * MS_WEEK)
    projectedDate = eta.toISOString()
    if (weeksLeft <= 0) {
      status = 'behind'
    } else {
      // small buffer (~3 days) so "basically on time" reads as on-track
      const slackMs = 3 * 24 * 60 * 60 * 1000
      if (eta.getTime() <= target.getTime() - slackMs) status = 'ahead'
      else if (eta.getTime() <= target.getTime() + slackMs) status = 'on-track'
      else status = 'behind'
    }
  }

  return { requiredPerWeek, actualPerWeek, projectedDate, weeksLeft, status }
}

/** Whether a metric type can derive its current value automatically. */
export function isDerivable(metric: GoalMetricType): boolean {
  return metric !== 'custom'
}

export const METRIC_LABELS: Record<GoalMetricType, string> = {
  bodyweight: 'Bodyweight',
  bodyfat: 'Body fat',
  e1rm: 'Estimated 1RM',
  volume: 'Weekly volume',
  custom: 'Custom',
}

/** Sensible default unit for the metric, used to prefill the form. */
export function defaultUnitFor(
  metric: GoalMetricType,
  profileUnit: 'lb' | 'kg',
): string {
  switch (metric) {
    case 'bodyfat':
      return '%'
    case 'volume':
      return `${profileUnit} vol`
    case 'bodyweight':
    case 'e1rm':
      return profileUnit
    default:
      return ''
  }
}
