"use client"

import { differenceInCalendarDays, format, isValid, parseISO } from "date-fns"
import { Dumbbell, Target } from "lucide-react"

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Progress,
} from "@/components/ui"
import { cn } from "@/lib/utils"
import {
  computePacing,
  computeProgress,
  METRIC_LABELS,
  type PaceStatus,
} from "@/components/goals/progress"

import type { GoalProgressRow } from "./types"

const PACE_META: Record<PaceStatus, { label: string; tone: string }> = {
  reached: { label: "Target reached", tone: "text-gate-green" },
  ahead: { label: "Ahead of pace", tone: "text-gate-green" },
  "on-track": { label: "On track", tone: "text-signal" },
  behind: { label: "Behind pace", tone: "text-gate-yellow" },
  stalled: { label: "Not on pace", tone: "text-gate-red" },
}

function fmtNum(n: number | null): string | null {
  if (n == null) return null
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10)
}

function daysMeta(targetDate: string | null) {
  if (!targetDate) return null
  const d = parseISO(targetDate)
  if (!isValid(d)) return null
  return { days: differenceInCalendarDays(d, new Date()), date: d }
}

export function GoalsProgress({ goals }: { goals: GoalProgressRow[] }) {
  if (goals.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Target className="size-4 text-signal" aria-hidden />
          Goal progress
        </CardTitle>
        <CardDescription>
          Where you stand against the targets you set.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {goals.map((g) => (
          <GoalRow key={g.id} goal={g} />
        ))}
      </CardContent>
    </Card>
  )
}

function GoalRow({ goal }: { goal: GoalProgressRow }) {
  const isActive = goal.status === "active"
  const progress = computeProgress(goal.startValue, goal.current, goal.targetValue)
  const pacing = isActive
    ? computePacing(
        goal.startValue,
        goal.current,
        goal.targetValue,
        goal.createdAt,
        goal.targetDate,
      )
    : null
  const dm = daysMeta(goal.targetDate)

  const pctLabel = progress != null ? `${Math.round(progress.pct)}%` : null
  const reached = progress != null && progress.pct >= 100

  return (
    <div className="space-y-2 rounded-md border border-border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-medium">{goal.title}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="gap-1">
              {goal.metricType === "e1rm" ? <Dumbbell aria-hidden /> : null}
              {METRIC_LABELS[goal.metricType]}
            </Badge>
            {goal.metricType === "e1rm" && goal.exerciseName ? (
              <span className="truncate text-xs text-muted">{goal.exerciseName}</span>
            ) : null}
            {goal.status === "achieved" ? (
              <Badge variant="success">Achieved</Badge>
            ) : null}
            {goal.status === "abandoned" ? (
              <Badge variant="muted">Abandoned</Badge>
            ) : null}
          </div>
        </div>
        {pctLabel ? (
          <span
            className={cn(
              "font-mono text-sm font-semibold tabular-nums",
              reached ? "text-signal" : "text-foreground",
            )}
          >
            {pctLabel}
          </span>
        ) : null}
      </div>

      {progress != null ? (
        <>
          <Progress value={progress.pct} aria-label={`Progress for ${goal.title}`} />
          <div className="flex items-center justify-between font-mono text-[11px] tabular-nums text-muted">
            <span>
              {fmtNum(goal.startValue) ?? "—"}
              <span className="ml-1 text-muted/70">start</span>
            </span>
            <span className="text-foreground">
              {fmtNum(goal.current) ?? "—"}
              <span className="ml-1 text-muted">now</span>
            </span>
            <span>
              {fmtNum(goal.targetValue) ?? "—"}
              <span className="ml-1 text-muted/70">target</span>
            </span>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between text-xs text-muted">
          <span className="font-mono tabular-nums text-foreground">
            target {fmtNum(goal.targetValue) ?? "—"}
            {goal.targetUnit ? ` ${goal.targetUnit}` : ""}
          </span>
          <span>
            {goal.metricType === "custom"
              ? "Tracked manually"
              : "No data yet"}
          </span>
        </div>
      )}

      {(pacing && pacing.status !== "reached") || dm ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-0.5 text-[11px]">
          {pacing && pacing.status !== "reached" ? (
            <span
              className={cn("font-mono font-semibold", PACE_META[pacing.status].tone)}
            >
              {PACE_META[pacing.status].label}
            </span>
          ) : (
            <span />
          )}
          {dm ? (
            <span
              className={cn(
                "font-mono tabular-nums",
                dm.days < 0
                  ? "text-gate-red"
                  : dm.days <= 7
                    ? "text-gate-yellow"
                    : "text-muted",
              )}
            >
              {dm.days < 0
                ? `${Math.abs(dm.days)}d overdue`
                : dm.days === 0
                  ? "due today"
                  : `${dm.days}d left`}
              <span className="ml-1 text-muted/70">
                · {format(dm.date, "MMM d")}
              </span>
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
