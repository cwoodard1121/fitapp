'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { BatteryCharging, Loader2, Pencil } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { saveSessionReadiness } from '@/app/(app)/today/actions'

interface SessionReadinessProps {
  sessionId: string
  week: number
  allSlotIds: string[]
  /** Current session-level systemic recovery (fanned across the day's slots). */
  recovery: number | null
  /** Low-biased prefill from today's wearable recovery score; used only until rated. */
  suggested?: number | null
}

function Rating({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string
  label: string
  hint: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
        <span className="font-mono text-base font-semibold tabular-nums text-signal">
          {value}
          <span className="ml-0.5 text-xs font-normal text-muted">/10</span>
        </span>
      </div>
      <Slider
        id={id}
        min={1}
        max={10}
        step={1}
        value={[value]}
        onValueChange={(v) => onChange(v[0] ?? value)}
        aria-label={label}
      />
      <p className="text-[11px] leading-tight text-muted">{hint}</p>
    </div>
  )
}

export function SessionReadiness({
  sessionId,
  week,
  allSlotIds,
  recovery: initRecovery,
  suggested,
}: SessionReadinessProps) {
  const rated = initRecovery != null
  const [expanded, setExpanded] = React.useState(!rated)
  // Default to the wearable-suggested readiness (low-biased) when un-rated, else 7.
  const [recovery, setRecovery] = React.useState(initRecovery ?? suggested ?? 7)
  const [pending, startTransition] = React.useTransition()

  function onSave() {
    startTransition(async () => {
      const res = await saveSessionReadiness({
        sessionId,
        week,
        recovery,
        allSlotIds,
      })
      if (res.ok) {
        toast.success('Readiness saved.')
        setExpanded(false)
      } else {
        toast.error(res.error)
      }
    })
  }

  // Collapsed summary once rated.
  if (rated && !expanded) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between gap-3 p-3.5">
          <div className="flex items-center gap-3">
            <BatteryCharging className="size-4 text-signal" aria-hidden />
            <div className="font-mono text-sm tabular-nums">
              <span className="text-muted">Readiness </span>
              <span className="font-semibold text-foreground">
                {initRecovery ?? '—'}
                <span className="ml-0.5 text-xs font-normal text-muted">/10</span>
              </span>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted"
            onClick={() => setExpanded(true)}
          >
            <Pencil className="size-3.5" aria-hidden />
            Adjust
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-signal">
            <BatteryCharging className="size-4" aria-hidden />
          </div>
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold">Overall readiness</h2>
            <p className="text-xs text-muted">
              One quick gut-check for the whole session — going in today, how ready
              and strong do you feel overall? (Sore muscles get logged per exercise.)
            </p>
          </div>
        </div>

        <Rating
          id="session-recovery"
          label="How ready do you feel?"
          hint="10 = fresh &amp; strong, ready to push · 1 = drained, weak, beat-up."
          value={recovery}
          onChange={setRecovery}
        />

        {!rated && suggested != null ? (
          <p className="flex items-start gap-1.5 text-[11px] leading-tight text-muted">
            <BatteryCharging className="mt-px size-3.5 shrink-0 text-signal" aria-hidden />
            Pre-filled to {suggested} from today&apos;s recovery score — nudge it if you feel
            different.
          </p>
        ) : null}

        <Button type="button" onClick={onSave} disabled={pending} className="w-full">
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Saving
            </>
          ) : (
            'Save readiness'
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
