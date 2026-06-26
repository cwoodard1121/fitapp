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

import type { AiAnalysis, Priority } from '@/lib/types'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
              Generate a short read of where your training, goals, body, and
              nutrition stand, plus the top things to do next. It interprets the
              computed numbers; it never invents them. Per-lift and per-goal
              detail shows up on Today and Goals.
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

  // One-line reads per area. The lift-by-lift and goal-by-goal detail lives on
  // Today (coach notes) and Goals (pacing board) — here we stay high-level.
  const reads: { label: string; text: string }[] = [
    { label: 'Training', text: p.training.summary },
    { label: 'Goals', text: p.goals.summary },
    { label: 'Body', text: [p.body.summary, p.body.trajectory].filter(Boolean).join(' ') },
    {
      label: 'Nutrition',
      text: [p.nutrition.summary, p.nutrition.advice].filter(Boolean).join(' '),
    },
  ].filter((r) => r.text.trim() !== '')

  const hasTags =
    p.training.strongAreas.length > 0 || p.training.laggingMuscles.length > 0

  return (
    <div className="space-y-4">
      {/* Headline + overview + pacing — the gist in three short beats. */}
      <div className="space-y-2">
        {p.headline ? (
          <p className="text-sm font-semibold leading-snug text-foreground">
            {p.headline}
          </p>
        ) : null}
        {p.overview ? (
          <p className="text-sm leading-snug text-muted">{p.overview}</p>
        ) : null}
        {p.pacing ? (
          <p className="rounded-md border border-border bg-surface p-2.5 text-sm leading-snug text-foreground">
            {p.pacing}
          </p>
        ) : null}
      </div>

      {/* Top 3 actions — the actionable core. */}
      {p.priorities.length > 0 ? (
        <div className="space-y-2">
          <SectionLabel icon={<ListChecks className="size-3.5" aria-hidden />}>
            Do next
          </SectionLabel>
          <ol className="space-y-2">
            {p.priorities.slice(0, 3).map((pri, i) => (
              <PriorityRow key={i} index={i + 1} priority={pri} />
            ))}
          </ol>
        </div>
      ) : null}

      {/* Compact one-line reads. */}
      {reads.length > 0 ? (
        <div className="space-y-2 border-t border-border pt-3">
          {reads.map((r) => (
            <div key={r.label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
              <span className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-muted sm:w-20 sm:pt-0.5">
                {r.label}
              </span>
              <p className="text-sm leading-snug text-foreground">{r.text}</p>
            </div>
          ))}
        </div>
      ) : null}

      {/* Strong / lagging at a glance. */}
      {hasTags ? (
        <div className="space-y-1.5 border-t border-border pt-3">
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
