import { MessageSquareText } from 'lucide-react'

import type { LiftAdvice } from '@/lib/types'
import { Badge } from '@/components/ui/badge'

type Tone = 'secondary' | 'warning' | 'danger'

/** Status -> badge variant + short label. Only attention-worthy states surface. */
const STATUS_META: Record<
  LiftAdvice['status'],
  { tone: Tone; label: string } | null
> = {
  stalling: { tone: 'warning', label: 'Stalling' },
  regressing: { tone: 'danger', label: 'Regressing' },
  calibrating: { tone: 'secondary', label: 'Calibrating' },
  // "All good" states are intentionally skipped to avoid cluttering the log.
  progressing: null,
  maintaining: null,
}

/**
 * Compact "Coach notes for today" card. Given the AI lift advice already matched
 * to the selected day's exercises, it surfaces only the lifts that need
 * attention (stalling / regressing / calibrating) with a one-line cue. Renders
 * nothing when there's nothing useful to say.
 */
export function ExerciseAdvice({ items }: { items: LiftAdvice[] }) {
  const notable = items
    .map((a) => ({ advice: a, meta: STATUS_META[a.status] }))
    .filter(
      (x): x is { advice: LiftAdvice; meta: { tone: Tone; label: string } } =>
        x.meta != null && (x.advice.advice.trim() !== '' || x.advice.note.trim() !== ''),
    )
    .slice(0, 4)

  if (notable.length === 0) return null

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
        <MessageSquareText className="size-3.5" aria-hidden />
        Coach notes for today
      </p>
      <ul className="space-y-2.5">
        {notable.map(({ advice, meta }, i) => {
          const cue = advice.advice.trim() || advice.note.trim()
          return (
            <li key={i} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-foreground">
                  {advice.exercise}
                </span>
                <Badge variant={meta.tone}>{meta.label}</Badge>
              </div>
              <p className="text-sm leading-snug text-muted">{cue}</p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
