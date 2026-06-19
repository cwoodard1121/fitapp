'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  HeartPulse,
  Loader2,
} from 'lucide-react'

import type { Performance, RirOverride, SetLog } from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { saveReadiness } from '@/app/(app)/today/actions'

interface ReadinessSheetProps {
  sessionId: string
  slotId: string
  week: number
  exerciseName: string
  slotCode: string
  allSlotIds: string[]
  log: SetLog | null
}

const PERF_OPTIONS: { value: Performance; label: string; Icon: typeof ArrowUp }[] =
  [
    { value: 'Up', label: 'Up', Icon: ArrowUp },
    { value: 'Same', label: 'Same', Icon: ArrowRight },
    { value: 'Down', label: 'Down', Icon: ArrowDown },
  ]

const RIR_OPTIONS: { value: RirOverride; label: string }[] = [
  { value: 'Y', label: 'Hit RIR' },
  { value: 'N', label: 'Missed' },
  { value: 'Skip', label: 'Skip' },
]

function RatingSlider({
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

export function ReadinessSheet({
  sessionId,
  slotId,
  week,
  exerciseName,
  slotCode,
  allSlotIds,
  log,
}: ReadinessSheetProps) {
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  const [pump, setPump] = React.useState(log?.pump ?? 7)
  const [soreness, setSoreness] = React.useState(log?.soreness ?? 4)
  const [recovery, setRecovery] = React.useState(log?.recovery ?? 7)
  const [enjoyment, setEnjoyment] = React.useState(log?.enjoyment ?? 7)
  const [performance, setPerformance] = React.useState<Performance | null>(
    log?.performance ?? null,
  )
  const [rirOverride, setRirOverride] = React.useState<RirOverride | null>(
    log?.hit_rir_override ?? null,
  )
  const [notes, setNotes] = React.useState(log?.notes ?? '')
  const [applyToAll, setApplyToAll] = React.useState(true)

  const hasReadiness =
    log != null &&
    (log.pump != null ||
      log.soreness != null ||
      log.recovery != null ||
      log.enjoyment != null ||
      log.performance != null ||
      log.notes != null)

  function onSave() {
    startTransition(async () => {
      const res = await saveReadiness({
        sessionId,
        slotId,
        week,
        pump,
        soreness,
        recovery,
        enjoyment,
        performance,
        hitRirOverride: rirOverride,
        notes: notes.trim() === '' ? null : notes.trim(),
        applyToAll,
        allSlotIds,
      })
      if (res.ok) {
        toast.success(
          applyToAll
            ? 'Readiness saved — recovery & performance applied to all.'
            : 'Readiness saved.',
        )
        setOpen(false)
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            'h-9 gap-1.5',
            hasReadiness && 'border-signal/40 text-signal',
          )}
        >
          <HeartPulse className="size-4" aria-hidden />
          Readiness
          {hasReadiness ? (
            <span
              className="size-1.5 rounded-full bg-signal"
              aria-label="rated"
            />
          ) : null}
        </Button>
      </SheetTrigger>

      <SheetContent
        side="bottom"
        className="max-h-[88svh] overflow-y-auto pb-8"
      >
        <SheetHeader className="text-left">
          <SheetTitle>
            <span className="font-mono text-sm text-muted">{slotCode}</span>{' '}
            {exerciseName}
          </SheetTitle>
          <SheetDescription>
            Rate how it felt — the engine uses this to make the call.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <RatingSlider
              id={`pump-${slotId}`}
              label="Pump"
              hint="How full / worked the muscle felt (exercise-specific)."
              value={pump}
              onChange={setPump}
            />
            <RatingSlider
              id={`soreness-${slotId}`}
              label="Soreness"
              hint="Lingering soreness coming into this exercise."
              value={soreness}
              onChange={setSoreness}
            />
            <RatingSlider
              id={`recovery-${slotId}`}
              label="Recovery"
              hint="Systemic — overall readiness today."
              value={recovery}
              onChange={setRecovery}
            />
            <RatingSlider
              id={`enjoyment-${slotId}`}
              label="Enjoyment"
              hint="Did you want to keep going?"
              value={enjoyment}
              onChange={setEnjoyment}
            />
          </div>

          {/* Performance — systemic, 3-way */}
          <div className="space-y-2">
            <Label className="text-sm">Performance vs last time</Label>
            <div className="grid grid-cols-3 gap-2">
              {PERF_OPTIONS.map(({ value, label, Icon }) => {
                const active = performance === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPerformance(active ? null : value)}
                    aria-pressed={active}
                    className={cn(
                      'inline-flex h-11 items-center justify-center gap-1.5 rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                      active
                        ? 'border-signal bg-signal/10 text-signal'
                        : 'border-border bg-background text-foreground hover:bg-surface',
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Hit RIR override — Y / N / Skip */}
          <div className="space-y-2">
            <Label className="text-sm">Hit your target RIR?</Label>
            <div className="grid grid-cols-3 gap-2">
              {RIR_OPTIONS.map(({ value, label }) => {
                const active = rirOverride === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRirOverride(active ? null : value)}
                    aria-pressed={active}
                    className={cn(
                      'inline-flex h-11 items-center justify-center rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                      active
                        ? 'border-signal bg-signal/10 text-signal'
                        : 'border-border bg-background text-foreground hover:bg-surface',
                    )}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] leading-tight text-muted">
              Leave blank to let the engine read it from your RIR.
            </p>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor={`notes-${slotId}`} className="text-sm">
              Notes
            </Label>
            <Textarea
              id={`notes-${slotId}`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Bar speed, aches, setup tweaks…"
              className="min-h-16"
            />
          </div>

          {/* Apply systemic ratings to all */}
          <label
            htmlFor={`apply-all-${slotId}`}
            className="flex items-center justify-between gap-4 rounded-md border border-border bg-background p-3"
          >
            <span className="space-y-0.5">
              <span className="block text-sm font-medium">
                Apply to every exercise
              </span>
              <span className="block text-[11px] leading-tight text-muted">
                Recovery &amp; performance are systemic — copy them to all slots.
              </span>
            </span>
            <Switch
              id={`apply-all-${slotId}`}
              checked={applyToAll}
              onCheckedChange={setApplyToAll}
            />
          </label>

          <Button
            type="button"
            size="touch"
            onClick={onSave}
            disabled={pending}
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Saving
              </>
            ) : (
              'Save readiness'
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
