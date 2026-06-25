'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { Sparkles, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react'

import type { AiAnalysis } from '@/lib/types'
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
              A structured read on your training, goals, body, and nutrition.
            </CardDescription>
          </div>
          {analysis ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerate}
              disabled={pending}
            >
              <RefreshCw className={`size-3.5 ${pending ? 'animate-spin' : ''}`} aria-hidden />
              {pending ? 'Refreshing…' : 'Refresh'}
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {analysis ? (
          <AnalysisBody analysis={analysis} />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Generate a lightweight AI summary of where your training stands —
              strong and lagging lifts, goal pacing, and a few things to focus on
              next.
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
    <div className="space-y-4">
      <div className="space-y-1.5">
        {p.headline ? (
          <p className="text-sm font-semibold text-foreground">{p.headline}</p>
        ) : null}
        {p.overview ? (
          <p className="text-sm leading-snug text-muted">{p.overview}</p>
        ) : null}
      </div>

      <Section title="Training" summary={p.training.summary}>
        <TagRow tone="green" icon={<TrendingUp className="size-3" aria-hidden />} items={p.training.strong_areas} />
        <TagRow tone="yellow" icon={<TrendingDown className="size-3" aria-hidden />} items={p.training.lagging_areas} />
      </Section>

      <Section title="Goals" summary={p.goals.summary}>
        <TagRow tone="green" items={p.goals.on_track} />
        <TagRow tone="red" items={p.goals.at_risk} />
      </Section>

      {p.body.summary ? <Section title="Body" summary={p.body.summary} /> : null}
      {p.nutrition.summary ? <Section title="Nutrition" summary={p.nutrition.summary} /> : null}

      {p.focus.length > 0 ? (
        <div className="space-y-1.5 rounded-md border border-signal/30 bg-signal/5 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-signal">
            <Sparkles className="size-3.5" aria-hidden />
            Focus next
          </p>
          <ul className="space-y-1">
            {p.focus.slice(0, 6).map((f, i) => (
              <li key={i} className="flex gap-2 text-sm text-foreground">
                <span className="text-signal" aria-hidden>•</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-[11px] text-muted">Updated {updatedLabel(analysis.created_at)}</p>
    </div>
  )
}

function Section({
  title,
  summary,
  children,
}: {
  title: string
  summary: string
  children?: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{title}</p>
      {summary ? <p className="text-sm leading-snug text-foreground">{summary}</p> : null}
      {children}
    </div>
  )
}

function TagRow({
  items,
  tone,
  icon,
}: {
  items: string[]
  tone: 'green' | 'yellow' | 'red'
  icon?: React.ReactNode
}) {
  if (items.length === 0) return null
  const toneClass =
    tone === 'green'
      ? 'border-gate-green/40 text-gate-green'
      : tone === 'yellow'
        ? 'border-gate-yellow/40 text-gate-yellow'
        : 'border-gate-red/40 text-gate-red'

  return (
    <div className="flex flex-wrap gap-1.5">
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
