'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import {
  Sparkles,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ListChecks,
} from 'lucide-react'

import type {
  AiAnalysis,
  GoalAdvice,
  LiftAdvice,
  Priority,
} from '@/lib/types'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Separator,
} from '@/components/ui'
import { generateAnalysisAction } from '@/app/(app)/analysis/actions'

interface AnalysisPanelProps {
  analysis: AiAnalysis | null
  allowed: boolean
}

/**
 * AnalysisPanel — the AI interpretation surface. It renders the rich
 * AnalysisPayload (headline, overview, pacing, ranked priorities, per-lift and
 * per-goal advice, body + nutrition reads) that the LLM writes ON TOP of the
 * deterministic analytics. Gated to allowlisted accounts; renders null otherwise.
 */
export function AnalysisPanel({ analysis, allowed }: AnalysisPanelProps) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()

  if (!allowed) return null

  function handleGenerate() {
    startTransition(async () => {
      const res = await generateAnalysisAction()
      if (res.ok) {
        toast.success('Overview updated.')
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-signal" aria-hidden />
              AI overview
            </CardTitle>
            <CardDescription>
              A coach&apos;s read on your training, goals, body, and nutrition —
              grounded in the numbers above.
            </CardDescription>
          </div>
          {analysis ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerate}
              disabled={pending}
            >
              <RefreshCw
                className={`size-3.5 ${pending ? 'animate-spin' : ''}`}
                aria-hidden
              />
              {pending ? 'Refreshing…' : 'Refresh'}
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {analysis ? (
          <AnalysisBody analysis={analysis} />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Generate an AI read of where your training stands — per-lift and
              per-goal pacing, body and nutrition trajectory, and a ranked list
              of what to do next. It interprets the computed numbers; it never
              invents them.
            </p>
            <Button onClick={handleGenerate} disabled={pending}>
              <Sparkles className="size-4" aria-hidden />
              {pending ? 'Generating…' : 'Generate overview'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Rendered payload                                                    */
/* ------------------------------------------------------------------ */

function AnalysisBody({ analysis }: { analysis: AiAnalysis }) {
  const p = analysis.payload

  return (
    <div className="space-y-5">
      {/* Headline + overview + pacing. */}
      <div className="space-y-2">
        {p.headline ? (
          <p className="text-sm font-semibold text-foreground">{p.headline}</p>
        ) : null}
        {p.overview ? (
          <p className="text-sm leading-snug text-muted">{p.overview}</p>
        ) : null}
        {p.pacing ? (
          <p className="rounded-md border border-border bg-surface p-3 text-sm leading-snug text-foreground">
            {p.pacing}
          </p>
        ) : null}
      </div>

      {/* Ranked priorities. */}
      {p.priorities.length > 0 ? (
        <div className="space-y-2">
          <SectionLabel icon={<ListChecks className="size-3.5" aria-hidden />}>
            Priorities
          </SectionLabel>
          <ol className="space-y-2">
            {p.priorities.slice(0, 8).map((pri, i) => (
              <PriorityRow key={i} index={i + 1} priority={pri} />
            ))}
          </ol>
        </div>
      ) : null}

      <Separator />

      {/* Training. */}
      <div className="space-y-3">
        <SectionLabel>Training</SectionLabel>
        {p.training.summary ? (
          <p className="text-sm leading-snug text-foreground">
            {p.training.summary}
          </p>
        ) : null}

        {p.training.lifts.length > 0 ? (
          <ul className="divide-y divide-border">
            {p.training.lifts.map((l, i) => (
              <LiftAdviceRow key={`${l.exercise}-${i}`} lift={l} />
            ))}
          </ul>
        ) : null}

        <div className="space-y-1.5">
          <TagRow
            label="Strong"
            tone="green"
            icon={<TrendingUp className="size-3" aria-hidden />}
            items={p.training.strongAreas}
          />
          <TagRow
            label="Lagging"
            tone="yellow"
            icon={<TrendingDown className="size-3" aria-hidden />}
            items={p.training.laggingMuscles}
          />
        </div>
      </div>

      {/* Goals. */}
      {p.goals.summary || p.goals.items.length > 0 ? (
        <>
          <Separator />
          <div className="space-y-3">
            <SectionLabel>Goals</SectionLabel>
            {p.goals.summary ? (
              <p className="text-sm leading-snug text-foreground">
                {p.goals.summary}
              </p>
            ) : null}
            {p.goals.items.length > 0 ? (
              <ul className="divide-y divide-border">
                {p.goals.items.map((g, i) => (
                  <GoalAdviceRow key={`${g.title}-${i}`} goal={g} />
                ))}
              </ul>
            ) : null}
          </div>
        </>
      ) : null}

      {/* Body + nutrition. */}
      {p.body.summary || p.body.trajectory ? (
        <>
          <Separator />
          <div className="space-y-1.5">
            <SectionLabel>Body</SectionLabel>
            {p.body.summary ? (
              <p className="text-sm leading-snug text-foreground">
                {p.body.summary}
              </p>
            ) : null}
            {p.body.trajectory ? (
              <p className="text-sm leading-snug text-muted">
                {p.body.trajectory}
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      {p.nutrition.summary || p.nutrition.advice ? (
        <>
          <Separator />
          <div className="space-y-1.5">
            <SectionLabel>Nutrition</SectionLabel>
            {p.nutrition.summary ? (
              <p className="text-sm leading-snug text-foreground">
                {p.nutrition.summary}
              </p>
            ) : null}
            {p.nutrition.advice ? (
              <p className="text-sm leading-snug text-muted">
                {p.nutrition.advice}
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      {/* Today focus nudge. */}
      {p.focus.length > 0 ? (
        <div className="space-y-1.5 rounded-md border border-signal/30 bg-signal/5 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-signal">
            <Sparkles className="size-3.5" aria-hidden />
            Focus next
          </p>
          <ul className="space-y-1">
            {p.focus.slice(0, 3).map((f, i) => (
              <li key={i} className="flex gap-2 text-sm text-foreground">
                <span className="text-signal" aria-hidden>
                  •
                </span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-[11px] text-muted">
        Updated {updatedLabel(analysis.created_at)}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

function PriorityRow({
  index,
  priority,
}: {
  index: number
  priority: Priority
}) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-signal/40 bg-signal/10 font-mono text-[11px] tabular-nums text-signal">
        {index}
      </span>
      <div className="min-w-0 space-y-0.5">
        {priority.title ? (
          <p className="text-sm font-medium text-foreground">{priority.title}</p>
        ) : null}
        {priority.why ? (
          <p className="text-xs leading-snug text-muted">{priority.why}</p>
        ) : null}
      </div>
    </li>
  )
}

function LiftAdviceRow({ lift }: { lift: LiftAdvice }) {
  return (
    <li className="space-y-1 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">
          {lift.exercise}
        </span>
        <LiftStatusBadge status={lift.status} />
      </div>
      {lift.note ? (
        <p className="text-xs leading-snug text-muted">{lift.note}</p>
      ) : null}
      {lift.advice ? (
        <p className="text-sm leading-snug text-foreground">
          <span className="text-signal" aria-hidden>
            →{' '}
          </span>
          {lift.advice}
        </p>
      ) : null}
    </li>
  )
}

function GoalAdviceRow({ goal }: { goal: GoalAdvice }) {
  return (
    <li className="space-y-1 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{goal.title}</span>
        <GoalStatusBadge status={goal.status} />
      </div>
      {goal.note ? (
        <p className="text-xs leading-snug text-muted">{goal.note}</p>
      ) : null}
      {goal.recommendation ? (
        <p className="text-sm leading-snug text-foreground">
          <span className="text-signal" aria-hidden>
            →{' '}
          </span>
          {goal.recommendation}
        </p>
      ) : null}
    </li>
  )
}

/* ------------------------------------------------------------------ */
/* Bits                                                                */
/* ------------------------------------------------------------------ */

function SectionLabel({
  children,
  icon,
}: {
  children: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
      {icon}
      {children}
    </p>
  )
}

function LiftStatusBadge({ status }: { status: LiftAdvice['status'] }) {
  switch (status) {
    case 'progressing':
      return <Badge variant="success">Progressing</Badge>
    case 'stalling':
      return <Badge variant="warning">Stalling</Badge>
    case 'regressing':
      return <Badge variant="danger">Regressing</Badge>
    case 'calibrating':
      return <Badge variant="signal">Calibrating</Badge>
    default:
      return <Badge variant="muted">Maintaining</Badge>
  }
}

function GoalStatusBadge({ status }: { status: GoalAdvice['status'] }) {
  switch (status) {
    case 'achieved':
      return <Badge variant="success">Achieved</Badge>
    case 'ahead':
      return <Badge variant="success">Ahead</Badge>
    case 'on_track':
      return <Badge variant="signal">On track</Badge>
    case 'behind':
      return <Badge variant="warning">Behind</Badge>
    default:
      return <Badge variant="muted">No data</Badge>
  }
}

function TagRow({
  items,
  tone,
  icon,
  label,
}: {
  items: string[]
  tone: 'green' | 'yellow' | 'red'
  icon?: React.ReactNode
  label?: string
}) {
  if (items.length === 0) return null
  const toneClass =
    tone === 'green'
      ? 'border-gate-green/40 text-gate-green'
      : tone === 'yellow'
        ? 'border-gate-yellow/40 text-gate-yellow'
        : 'border-gate-red/40 text-gate-red'

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {label ? (
        <span className="text-[10px] uppercase tracking-wider text-muted">
          {label}
        </span>
      ) : null}
      {items.map((item, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${toneClass}`}
        >
          {icon}
          {item}
        </span>
      ))}
    </div>
  )
}

function updatedLabel(iso: string): string {
  try {
    const d = parseISO(iso)
    return `${formatDistanceToNow(d, { addSuffix: true })} (${format(d, 'MMM d')})`
  } catch {
    return iso.slice(0, 10)
  }
}
