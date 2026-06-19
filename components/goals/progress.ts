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
