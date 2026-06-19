import type { Goal } from '@/lib/types'

/**
 * A goal enriched with its automatically-derived "current" value (where the
 * metric type allows it). `current` is null for custom goals or when there is
 * no data to derive from yet.
 */
export interface GoalWithCurrent extends Goal {
  current: number | null
}
