'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Check, Loader2 } from 'lucide-react'

import type { SlotView, Unit } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { Stat } from '@/components/ui/stat'
import { DecisionBadge } from '@/components/ui/decision-badge'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { saveSetEntry } from '@/app/(app)/today/actions'
import { ReadinessSheet } from '@/components/today/readiness-sheet'

interface SlotRowProps {
  view: SlotView
  sessionId: string
  week: number
  unit: Unit
  allSlotIds: string[]
}

/** Parse a numeric input string to a finite number, or null when empty/invalid. */
function num(s: string): number | null {
  const t = s.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function toField(n: number | null): string {
  return n == null ? '' : String(n)
}

const GATE_BADGE: Record<string, 'success' | 'warning' | 'danger'> = {
  Green: 'success',
  Yellow: 'warning',
  Red: 'danger',
}

export function SlotRow({
  view,
  sessionId,
  week,
  unit,
  allSlotIds,
}: SlotRowProps) {
  const { slot, log, targets, result } = view

  const [load, setLoad] = React.useState(toField(log?.actual_load ?? null))
  const [reps, setReps] = React.useState(toField(log?.best_reps ?? null))
  const [sets, setSets] = React.useState(toField(log?.actual_sets ?? null))
  const [rir, setRir] = React.useState(toField(log?.actual_rir ?? null))

  const [pending, startTransition] = React.useTransition()
  const [savedFlash, setSavedFlash] = React.useState(false)

  // Snapshot of the last persisted values so blur only writes on a real change.
  const lastSaved = React.useRef({
    load: log?.actual_load ?? null,
    reps: log?.best_reps ?? null,
    sets: log?.actual_sets ?? null,
    rir: log?.actual_rir ?? null,
  })

  function commit() {
    const next = {
      load: num(load),
      reps: num(reps),
      sets: num(sets),
      rir: num(rir),
    }
    const prev = lastSaved.current
    if (
      next.load === prev.load &&
      next.reps === prev.reps &&
      next.sets === prev.sets &&
      next.rir === prev.rir
    ) {
      return
    }

    startTransition(async () => {
      const res = await saveSetEntry({
        sessionId,
        slotId: slot.id,
        week,
        actualLoad: next.load,
        bestReps: next.reps,
        actualSets: next.sets,
        actualRir: next.rir,
      })
      if (res.ok) {
        lastSaved.current = next
        setSavedFlash(true)
        window.setTimeout(() => setSavedFlash(false), 1400)
      } else {
        toast.error(res.error)
      }
    })
  }

  const hasData =
    num(load) != null ||
    num(reps) != null ||
    num(sets) != null ||
    num(rir) != null

  const selectOnFocus = (e: React.FocusEvent<HTMLInputElement>) =>
    e.currentTarget.select()

  const fields: {
    key: string
    label: string
    value: string
    set: (v: string) => void
    unit?: string
    step?: string
  }[] = [
    { key: 'load', label: 'Load', value: load, set: setLoad, unit, step: 'any' },
    { key: 'reps', label: 'Reps', value: reps, set: setReps, step: '1' },
    { key: 'sets', label: 'Sets', value: sets, set: setSets, step: '1' },
    { key: 'rir', label: 'RIR', value: rir, set: setRir, step: 'any' },
  ]

  return (
    <Card className="overflow-hidden">
      {/* Header: exercise identity + readiness trigger */}
      <div className="flex items-start justify-between gap-3 p-4 pb-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-mono">
              {slot.slot_code}
            </Badge>
            {slot.muscle_area ? (
              <span className="truncate text-xs uppercase tracking-wide text-muted">
                {slot.muscle_area}
              </span>
            ) : null}
          </div>
          <h3 className="truncate text-base font-semibold leading-tight">
            {slot.exercise_name}
          </h3>
        </div>
        <ReadinessSheet
          sessionId={sessionId}
          slotId={slot.id}
          week={week}
          exerciseName={slot.exercise_name}
          slotCode={slot.slot_code}
          allSlotIds={allSlotIds}
          log={log}
        />
      </div>

      {/* Prescribed targets for the week */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2 px-4 pb-3">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
          Target
        </span>
        <Stat size="sm" label="Load" value={targets.load} unit={unit} />
        <Stat size="sm" label="Sets" value={targets.sets} />
        <Stat
          size="sm"
          label="Reps"
          value={targets.reps}
          placeholder="—"
        />
        <Stat size="sm" label="RIR" value={targets.rir} />
      </div>

      <Separator />

      {/* Fast inline entry */}
      <div className="grid grid-cols-4 gap-2 p-4 pt-3">
        {fields.map((f) => (
          <div key={f.key} className="space-y-1">
            <label
              htmlFor={`${f.key}-${slot.id}`}
              className="block text-[11px] font-medium uppercase tracking-wider text-muted"
            >
              {f.label}
              {f.unit ? (
                <span className="ml-1 normal-case text-muted/80">
                  {f.unit}
                </span>
              ) : null}
            </label>
            <input
              id={`${f.key}-${slot.id}`}
              type="number"
              inputMode="decimal"
              step={f.step}
              min={0}
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
              onFocus={selectOnFocus}
              onBlur={commit}
              placeholder="—"
              className="h-12 w-full rounded-md border border-border bg-background px-2 text-center font-mono text-lg font-semibold tabular-nums text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            />
          </div>
        ))}
      </div>

      {/* Decision readout — the signature element */}
      <div className="flex items-center justify-between gap-3 border-t border-border bg-background/40 px-4 py-3">
        {hasData ? (
          <>
            <DecisionBadge
              decision={result.decision}
              label={result.decisionLabel}
              reason={result.reason}
              className="min-w-0"
            />
            <div className="flex shrink-0 items-center gap-4">
              <Stat
                size="sm"
                label="e1RM"
                value={result.e1rm}
                unit={unit}
                tone="signal"
                precision={1}
              />
              {result.gate ? (
                <Badge variant={GATE_BADGE[result.gate]}>{result.gate}</Badge>
              ) : null}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">
            Log your set to get the engine&apos;s call.
          </p>
        )}
      </div>

      {/* Save status strip */}
      <div className="flex h-6 items-center justify-end px-4 pb-2 text-xs">
        {pending ? (
          <span className="inline-flex items-center gap-1 text-muted">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            Saving
          </span>
        ) : savedFlash ? (
          <span className="inline-flex items-center gap-1 text-gate-green">
            <Check className="size-3" aria-hidden />
            Saved
          </span>
        ) : null}
      </div>
    </Card>
  )
}
