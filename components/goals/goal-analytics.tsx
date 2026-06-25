import { format, parseISO } from 'date-fns'
import { Sparkles, Target } from 'lucide-react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { GoalAnalytic } from '@/lib/analytics/types'
import type { GoalAdvice } from '@/lib/types'

/* ------------------------------------------------------------------ */
/* Status presentation — maps the computed GoalAnalytic.status         */
/* ------------------------------------------------------------------ */

type Status = GoalAnalytic['status']

const STATUS_META: Record<
  Status,
  { label: string; variant: 'signal' | 'muted' | 'warning' | 'success' }
> = {
  achieved: { label: 'Achieved', variant: 'success' },
  ahead: { label: 'Ahead', variant: 'success' },
  // Standardized on 'signal' across surfaces (was 'secondary' here).
  on_track: { label: 'On track', variant: 'signal' },
  behind: { label: 'Behind', variant: 'warning' },
  no_data: { label: 'No data', variant: 'muted' },
}

/** Format a signed per-week rate, e.g. "-0.6 %/wk" or "+2.5 lb/wk". */
function fmtRate(n: number | null, unit: string | null): string | null {
  if (n == null || !Number.isFinite(n)) return null
  const v = Math.round(n * 100) / 100
  const sign = v > 0 ? '+' : ''
  const u = unit ? `${unit}/wk` : '/wk'
  return `${sign}${v} ${u}`
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null
  try {
    return format(parseISO(iso), 'MMM d, yyyy')
  } catch {
    return null
  }
}

/** Normalise a title for tolerant matching against AI advice. */
function norm(s: string): string {
  return s.trim().toLowerCase()
}

interface GoalAnalyticsPanelProps {
  /** Computed pacing for the active goals, in board order. */
  goals: GoalAnalytic[]
  /** AI goal advice (already gated to allowed accounts; empty otherwise). */
  advice: GoalAdvice[]
  /** AI one-line read on goal pacing (gated; null when unavailable). */
  aiSummary: string | null
}

/**
 * Compact pacing board shown at the top of the Goals page. Every number here is
 * DETERMINISTIC (from TrainingAnalytics.goals) — no LLM required. When AI advice
 * is available it attaches the matching GoalAdvice.recommendation as a subtle
 * "Coach" note per goal and an optional summary line; otherwise nothing
 * AI-related renders.
 */
export function GoalAnalyticsPanel({ goals, advice, aiSummary }: GoalAnalyticsPanelProps) {
  // Only show rows that actually have something to say (a %complete or a rate).
  const rows = goals.filter(
    (g) =>
      g.pctComplete != null ||
      g.requiredWeeklyRate != null ||
      g.actualWeeklyRate != null,
  )
  if (rows.length === 0) return null

  const adviceByTitle = new Map<string, GoalAdvice>()
  for (const a of advice) {
    if (a.title) adviceByTitle.set(norm(a.title), a)
  }
  const summary = aiSummary?.trim() ? aiSummary.trim() : null

  return (
    <Card className="mb-5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="size-4 text-signal" aria-hidden />
          Goal pacing
        </CardTitle>
        <CardDescription>
          Where each goal stands, how fast it must move, and where it lands.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {summary ? (
          <p className="text-sm leading-snug text-foreground">{summary}</p>
        ) : null}
        <div className="space-y-2.5">
          {rows.map((g) => (
            <GoalPacingRow
              key={g.id}
              goal={g}
              coach={adviceByTitle.get(norm(g.title))?.recommendation ?? null}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function GoalPacingRow({
  goal,
  coach,
}: {
  goal: GoalAnalytic
  coach: string | null
}) {
  const meta = STATUS_META[goal.status]
  const need = fmtRate(goal.requiredWeeklyRate, goal.unit)
  const trending = fmtRate(goal.actualWeeklyRate, goal.unit)
  const eta = fmtDate(goal.projectedEta)
  const pct = goal.pctComplete != null ? `${Math.round(goal.pctComplete)}%` : null
  const coachNote = coach?.trim() ? coach.trim() : null

  return (
    <div className="rounded-md border border-border bg-background px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{goal.title}</p>
          {pct ? (
            <p className="font-mono text-[11px] tabular-nums text-muted">
              {pct} complete
            </p>
          ) : null}
        </div>
        <Badge variant={meta.variant} className="shrink-0">
          {meta.label}
        </Badge>
      </div>

      {need || trending || eta ? (
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono text-[11px] tabular-nums">
          {need ? (
            <div className="flex flex-col">
              <span className="text-muted/70">need</span>
              <span className="text-foreground">{need}</span>
            </div>
          ) : null}
          {trending ? (
            <div className="flex flex-col">
              <span className="text-muted/70">trending</span>
              <span className="text-foreground">{trending}</span>
            </div>
          ) : null}
          {eta ? (
            <div className="col-span-2 flex items-center justify-between border-t border-border/60 pt-1.5">
              <span className="text-muted/70">projected arrival</span>
              <span className="text-foreground">~ {eta}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {coachNote ? (
        <div className={cn('mt-2 flex gap-1.5 border-t border-border/60 pt-2')}>
          <Sparkles className="mt-0.5 size-3 shrink-0 text-signal" aria-hidden />
          <p className="text-xs leading-snug text-muted">
            <span className="font-medium text-signal">Coach</span> · {coachNote}
          </p>
        </div>
      ) : null}
    </div>
  )
}
