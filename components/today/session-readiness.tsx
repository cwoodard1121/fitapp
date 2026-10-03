'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Check, Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { saveSessionReadiness } from '@/app/(app)/today/actions'

interface SessionReadinessProps {
  sessionId: string
  week: number
  /** Current session-level systemic recovery (fanned across the day's slots). */
  recovery: number | null
  /** Low-biased prefill from today's wearable recovery score; used only until rated. */
  suggested?: number | null
}

/**
 * One gut-check for the whole session, kept to a single row so the first set
 * stays in the first viewport. The rating saves the moment the thumb lifts;
 * there is no separate save step. Sore muscles are rated per exercise.
 */
export function SessionReadiness({
  sessionId,
  week,
  recovery: initRecovery,
  suggested,
}: SessionReadinessProps) {
  const [recovery, setRecovery] = React.useState<number | null>(initRecovery)
  const [saved, setSaved] = React.useState<number | null>(initRecovery)
  const [pending, startTransition] = React.useTransition()
  const shown = recovery ?? suggested ?? 7

  function save(value: number) {
    setRecovery(value)
    if (value === saved) return
    startTransition(async () => {
      const res = await saveSessionReadiness({ sessionId, week, recovery: value })
      if (res.ok) {
        setSaved(value)
      } else {
        toast.error(res.error)
        setRecovery(saved)
      }
    })
  }

  return (
    <section
      aria-label="Session readiness"
      className="rounded-lg border border-border bg-surface px-4 py-3"
    >
      <div className="flex items-center gap-3">
        <label
          htmlFor="session-recovery"
          className="shrink-0 text-sm font-bold"
        >
          readiness
        </label>
        <Slider
          id="session-recovery"
          min={1}
          max={10}
          step={1}
          value={[shown]}
          onPointerDown={() => {
            if (recovery == null) setRecovery(shown)
          }}
          onValueChange={(v) => setRecovery(v[0] ?? shown)}
          onValueCommit={(v) => save(v[0] ?? shown)}
          aria-label="How ready do you feel for this session, 1 to 10"
          aria-valuetext={
            recovery == null ? 'not rated; move to rate' : `${recovery} of 10`
          }
          className={cn('flex-1', recovery == null && 'opacity-50')}
        />
        <span
          className={cn(
            'flex w-14 shrink-0 items-center justify-end gap-1 font-mono text-base font-bold',
            recovery == null ? 'text-muted' : 'text-foreground',
          )}
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin text-muted" aria-label="saving" />
          ) : saved != null && saved === recovery ? (
            <Check className="size-3.5 text-gate-green" strokeWidth={3} aria-label="saved" />
          ) : null}
          {recovery ?? '–'}
          <span className="text-xs font-semibold text-muted">/10</span>
        </span>
      </div>

      {saved == null ? (
        <div className="mt-2 flex min-h-10 items-center justify-between gap-3">
          <p className="text-xs text-muted">
            {suggested != null
              ? `your wearable suggests ${suggested}.`
              : '1 drained · 10 fresh and strong'}
          </p>
          {suggested != null ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => save(suggested)}
            >
              use {suggested}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
