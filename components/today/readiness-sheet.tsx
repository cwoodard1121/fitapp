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

import type {
  Performance,
  RirOverride,
  SetLog,
  SlotTargets,
} from '@/lib/types'
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
import { Textarea } from '@/components/ui/textarea'
import { saveReadiness } from '@/app/(app)/today/actions'

interface ReadinessSheetProps {
  sessionId: string
  slotId: string
  week: number
  exerciseName: string
  slotCode: string
  log: SetLog | null
  targets: SlotTargets
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
  min = 1,
  value,
  onChange,
}: {
  id: string
  label: string
  hint: string
  min?: number
  value: number | null
  onChange: (v: number | null) => void
}) {
  const visualValue = value ?? Math.round((min + 10) / 2)

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
        {value == null ? (
          <span className="text-xs font-medium text-muted">Not rated</span>
        ) : (
          <span className="font-mono text-base font-semibold tabular-nums text-signal">
            {value}
            <span className="ml-0.5 text-xs font-normal text-muted">/10</span>
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Slider
          id={id}
          min={min}
          max={10}
          step={1}
          value={[visualValue]}
          onPointerDown={() => {
            if (value == null) onChange(visualValue)
          }}
          onValueChange={(next) => {
            const rating = next[0]
            if (rating != null) onChange(rating)
          }}
          aria-label={label}
          aria-valuetext={
            value == null ? 'Not rated; move slider to rate' : `${value} of 10`
          }
          className={cn('flex-1', value == null && 'opacity-50')}
        />
        {value != null ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(null)}
          >
            Clear
          </Button>
        ) : null}
      </div>
      <p className="text-[11px] leading-tight text-muted">
        {value == null ? 'Move the slider to rate. ' : null}
        {hint}
      </p>
    </div>
  )
}

export function ReadinessSheet({
  sessionId,
  slotId,
  week,
  exerciseName,
  slotCode,
  log,
  targets,
}: ReadinessSheetProps) {
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  const [pump, setPump] = React.useState<number | null>(log?.pump ?? null)
  const [pain, setPain] = React.useState<number | null>(log?.pain ?? null)
  const [enjoyment, setEnjoyment] = React.useState<number | null>(
    log?.enjoyment ?? null,
  )
  const [performance, setPerformance] = React.useState<Performance | null>(
    log?.performance ?? null,
  )
  const [rirOverride, setRirOverride] = React.useState<RirOverride | null>(
    log?.hit_rir_override ?? null,
  )
  const [notes, setNotes] = React.useState(log?.notes ?? '')

  const hasReadiness =
    log != null &&
    (log.pump != null ||
      log.pain != null ||
      log.enjoyment != null ||
      log.performance != null ||
      log.hit_rir_override != null ||
      log.notes != null)

  function onSave() {
    startTransition(async () => {
      const res = await saveReadiness({
        sessionId,
        slotId,
        week,
        pump,
        pain,
        enjoyment,
        performance,
        hitRirOverride: rirOverride,
        notes: notes.trim() === '' ? null : notes.trim(),
        targetLoad: targets.load,
        targetSets: targets.sets,
        targetReps: targets.reps,
        targetRir: targets.rir,
      })
      if (res.ok) {
        toast.success('Feedback saved.')
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
            'gap-1.5',
            hasReadiness && 'border-signal/40 text-signal',
          )}
        >
          <HeartPulse className="size-4" aria-hidden />
          Feedback
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
        className="max-h-[88svh] overflow-y-auto pb-[calc(2rem+env(safe-area-inset-bottom))]"
      >
        <SheetHeader className="text-left">
          <SheetTitle>
            <span className="font-mono text-sm text-muted">{slotCode}</span>{' '}
            {exerciseName}
          </SheetTitle>
          <SheetDescription>
            Add pump, pain, performance, and enjoyment from this workout. The
            engine uses explicit ratings to set the next session.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <RatingSlider
              id={`pump-${slotId}`}
              label="Pump"
              hint="How full / worked this muscle felt on this exercise."
              value={pump}
              onChange={setPump}
            />
            <RatingSlider
              id={`pain-${slotId}`}
              label="Pain"
              hint="0 = no pain. Stop the exercise for sharp or worsening pain, or pain that changes your movement."
              min={0}
              value={pain}
              onChange={setPain}
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
              'Save feedback'
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
