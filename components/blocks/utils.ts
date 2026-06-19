import {
  differenceInCalendarDays,
  format,
  isAfter,
  isBefore,
  parseISO,
} from "date-fns"

import type { Block, BlockKind } from "@/lib/types"

export const TRAINING_PHASES = [
  { value: "hypertrophy", label: "Hypertrophy" },
  { value: "strength", label: "Strength" },
  { value: "peak", label: "Peak" },
  { value: "maintain", label: "Maintain" },
] as const

export const DIET_PHASES = [
  { value: "cut", label: "Cut" },
  { value: "bulk", label: "Bulk" },
  { value: "recomp", label: "Recomp" },
  { value: "maintain", label: "Maintain" },
] as const

export function phaseOptions(kind: BlockKind) {
  return kind === "training" ? TRAINING_PHASES : DIET_PHASES
}

export function phaseLabel(kind: BlockKind, phase: string | null): string | null {
  if (!phase) return null
  const found = phaseOptions(kind).find((p) => p.value === phase)
  return found?.label ?? phase
}

/** Parse an ISO date column to a local Date, or null. */
function toDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = parseISO(value.slice(0, 10))
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatDate(value: string | null | undefined): string {
  const d = toDate(value)
  return d ? format(d, "MMM d, yyyy") : "—"
}

export function formatRange(block: Block): string {
  const s = toDate(block.start_date)
  const e = toDate(block.end_date)
  if (s && e) return `${format(s, "MMM d")} – ${format(e, "MMM d, yyyy")}`
  if (s) return `from ${format(s, "MMM d, yyyy")}`
  if (e) return `until ${format(e, "MMM d, yyyy")}`
  return "No dates set"
}

export type TimeState = "upcoming" | "current" | "past" | "undated"

export interface BlockProgress {
  /** Weeks elapsed since start (clamped to [0, length]). */
  weeksElapsed: number
  /** Total planned weeks (length_weeks, falling back to date span). */
  totalWeeks: number | null
  /** 0..100 for the Progress component, or null when not computable. */
  percent: number | null
  /** Whole days remaining until the planned end (negative = overdue). */
  daysRemaining: number | null
  state: TimeState
}

/**
 * Week-elapsed math from start_date + length_weeks (date math only — no engine).
 */
export function computeProgress(block: Block, today: Date = new Date()): BlockProgress {
  const start = toDate(block.start_date)
  const end = toDate(block.end_date)
  const length = block.length_weeks ?? null

  if (!start) {
    return {
      weeksElapsed: 0,
      totalWeeks: length,
      percent: null,
      daysRemaining: null,
      state: "undated",
    }
  }

  let state: TimeState = "current"
  if (isBefore(today, start)) state = "upcoming"

  const daysSinceStart = differenceInCalendarDays(today, start)
  const totalWeeks =
    length ??
    (end ? Math.max(1, Math.round(differenceInCalendarDays(end, start) / 7)) : null)

  let percent: number | null = null
  let weeksElapsed = Math.max(0, daysSinceStart / 7)
  if (totalWeeks && totalWeeks > 0) {
    weeksElapsed = Math.min(totalWeeks, Math.max(0, daysSinceStart / 7))
    percent = Math.min(100, Math.max(0, (weeksElapsed / totalWeeks) * 100))
  }

  // Determine end for past/overdue logic.
  let plannedEnd = end
  if (!plannedEnd && totalWeeks) {
    plannedEnd = new Date(start.getTime() + totalWeeks * 7 * 24 * 60 * 60 * 1000)
  }
  const daysRemaining = plannedEnd
    ? differenceInCalendarDays(plannedEnd, today)
    : null

  if (plannedEnd && isAfter(today, plannedEnd)) state = "past"

  return {
    weeksElapsed,
    totalWeeks,
    percent,
    daysRemaining,
    state,
  }
}

/** Current week index (1-based) for display, e.g. "Week 3 of 6". */
export function currentWeekLabel(p: BlockProgress): string | null {
  if (!p.totalWeeks) return null
  if (p.state === "upcoming") return `Starts soon · ${p.totalWeeks} wk`
  const wk = Math.min(p.totalWeeks, Math.floor(p.weeksElapsed) + 1)
  return `Week ${wk} of ${p.totalWeeks}`
}

export function kindLabel(kind: BlockKind): string {
  return kind === "training" ? "Training" : "Diet"
}
