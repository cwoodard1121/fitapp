"use client"

import Link from "next/link"
import { ArrowRight, Target } from "lucide-react"

import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui"
import { computePacing, computeProgress, type PaceStatus } from "@/components/goals/progress"

import type { GoalProgressRow } from "./types"

const ON_PACE: PaceStatus[] = ["reached", "ahead", "on-track"]

/**
 * Compact goal summary — links out to the real Goals page instead of
 * duplicating its full progress-bar/pace-badge card (see components/goals/
 * goal-card.tsx, which already renders the same thing with edit/delete/AI
 * coach chrome Progress had no room for and was reimplementing anyway).
 */
export function GoalsProgress({ goals }: { goals: GoalProgressRow[] }) {
  const active = goals.filter((g) => g.status === "active")
  if (active.length === 0) return null

  const onPace = active.filter((g) => {
    const progress = computeProgress(g.startValue, g.current, g.targetValue)
    if (progress == null) return false
    if (progress.pct >= 100) return true
    const pacing = computePacing(g.startValue, g.current, g.targetValue, g.createdAt, g.targetDate)
    return pacing != null && ON_PACE.includes(pacing.status)
  }).length

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Target className="size-4 text-signal" aria-hidden />
          Goal progress
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Link
          href="/goals"
          className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3 transition-colors hover:border-signal/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <span className="flex items-center gap-2 text-sm">
            <Badge variant={onPace > 0 ? "signal" : "muted"}>
              {active.length} active goal{active.length === 1 ? "" : "s"}
            </Badge>
            <span className="text-muted">
              {onPace}/{active.length} on pace
            </span>
          </span>
          <span className="flex items-center gap-1 text-xs font-medium text-signal">
            View goals
            <ArrowRight className="size-3.5" aria-hidden />
          </span>
        </Link>
      </CardContent>
    </Card>
  )
}
