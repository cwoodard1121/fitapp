'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Check, Loader2, Plus, Sparkles, X } from 'lucide-react'

import type { SlotView, Unit } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Stat } from '@/components/ui/stat'
import { DecisionBadge } from '@/components/ui/decision-badge'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { saveSetEntries } from '@/app/(app)/today/actions'
import { ReadinessSheet } from '@/components/today/readiness-sheet'
import {
  enqueueTrainingSave,
  registerTrainingSaveRetry,
} from '@/lib/client/training-save-queue'

interface SlotRowProps {
  view: SlotView
  sessionId: string
  week: number
  unit: Unit
}

interface Row {
  load: string
  reps: string
  rir: string
}

/** Parse a numeric input string to a finite number, or null when empty/invalid. */
function num(s: string): number | null {
  const t = s.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function toField(n: number | null | undefined): string {
  return n == null ? '' : String(n)
}

function row(load: number | null, reps: number | null, rir: number | null): Row {
  return { load: toField(load), reps: toField(reps), rir: toField(rir) }
}

/** Build the starting set list: saved sets, else legacy aggregate, padded with
 *  prefilled (target-load) rows up to the planned set count for fast logging. */
function initialRows(view: SlotView): Row[] {
  const target = Math.max(1, Math.round(view.targets.sets ?? 0) || 1)
  let rows: Row[] = []

  if (view.entries.length > 0) {
    rows = view.entries.map((e) => row(e.load, e.reps, e.rir))
  } else if (
    view.log &&
    (view.log.actual_load != null ||
      view.log.best_reps != null ||
      view.log.actual_sets != null)
  ) {
    // Legacy aggregate row (logged before per-set) — show it as editable sets.
    const n = Math.max(1, Math.round(view.log.actual_sets ?? 1))
    rows = Array.from({ length: n }, () =>
      row(view.log!.actual_load, view.log!.best_reps, view.log!.actual_rir),
    )
  }

  const padLoad = rows.length ? num(rows[rows.length - 1].load) : view.targets.load
  while (rows.length < target) rows.push(row(padLoad, null, null))
  if (rows.length === 0) rows.push(row(view.targets.load, null, null))
  return rows
}

/** JSON of the "performed" sets (those with reps) — what actually persists. */
function realSnapshot(rows: Row[]): string {
  return JSON.stringify(
    rows
      .map((r) => ({ load: num(r.load), reps: num(r.reps), rir: num(r.rir) }))
      .filter((r) => r.reps != null),
  )
}

/** Full editable draft, including target-prefilled rows with no reps yet. */
function draftSnapshot(rows: Row[]): string {
  return JSON.stringify(rows)
}

const GATE_BADGE: Record<string, 'success' | 'warning' | 'danger'> = {
  Green: 'success',
  Yellow: 'warning',
  Red: 'danger',
}

let nextSaveMountId = 0

export function SlotRow({ view, sessionId, week, unit }: SlotRowProps) {
  const { slot, log, targets, result } = view

  const [rows, setRows] = React.useState<Row[]>(() => initialRows(view))
  const [pending, startTransition] = React.useTransition()
  const saveInstanceId = React.useRef<string | null>(null)
  if (saveInstanceId.current == null) {
    nextSaveMountId += 1
    saveInstanceId.current = `mount-${nextSaveMountId}`
  }
  const [savedFlash, setSavedFlash] = React.useState(false)
  const mounted = React.useRef(true)
  const rowsRef = React.useRef(rows)
  const lastSaved = React.useRef(realSnapshot(initialRows(view)))
  const lastQueued = React.useRef(lastSaved.current)
  const lastHydratedDraft = React.useRef(
    draftSnapshot(initialRows(view)),
  )
  // A mount id keeps an unmounted dirty retry distinct if this slot is replaced
  // or revisited before its failed request settles.
  const logicalSaveKey = `${sessionId}:${slot.id}`
  const saveKey = `${logicalSaveKey}:${saveInstanceId.current}`
  const targetKey = [
    targets.load,
    targets.sets,
    targets.reps,
    targets.rir,
  ].join(':')
  const hydratedTargetKey = React.useRef(targetKey)

  React.useEffect(() => {
    rowsRef.current = rows
  }, [rows])
  React.useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  React.useEffect(() => {
    if (hydratedTargetKey.current === targetKey) return
    hydratedTargetKey.current = targetKey

    // Next-day feedback can change an untouched prescription during
    // router.refresh(). Refresh only pristine prefills; never overwrite a
    // draft the athlete has started entering.
    if (
      draftSnapshot(rowsRef.current) !== lastHydratedDraft.current
    ) {
      return
    }
    const nextRows = initialRows(view)
    rowsRef.current = nextRows
    lastHydratedDraft.current = draftSnapshot(nextRows)
    lastSaved.current = realSnapshot(nextRows)
    lastQueued.current = lastSaved.current
    setRows(nextRows)
  }, [targetKey, view])

  const setField = (i: number, field: keyof Row, value: string) => {
    setRows((prev) => {
      const next = prev.slice()
      next[i] = { ...next[i], [field]: value }
      return next
    })
  }

  const addSet = () => {
    setRows((prev) => {
      const last = prev[prev.length - 1]
      // Carry the previous set's load (most sets repeat the working weight).
      return [...prev, row(last ? num(last.load) : targets.load, null, null)]
    })
  }

  const removeSet = (i: number) => {
    if (rows.length <= 1) return
    const next = rows.filter((_, j) => j !== i)
    setRows(next)
    commitRows(next) // persist the removal right away (explicit next list)
  }

  const queueRows = React.useCallback(
    (rowsToSave: Row[], force = false): Promise<boolean> => {
      const snap = realSnapshot(rowsToSave)
      if (!force && snap === lastQueued.current) return Promise.resolve(true)

      const payload = rowsToSave.map((r) => ({
        load: num(r.load),
        reps: num(r.reps),
        rir: num(r.rir),
      }))
      lastQueued.current = snap

      const save = async (): Promise<boolean> => {
        try {
          const res = await saveSetEntries({
            sessionId,
            slotId: slot.id,
            week,
            entries: payload,
            targetLoad: targets.load,
            targetSets: targets.sets,
            targetReps: targets.reps,
            targetRir: targets.rir,
          })
          if (res.ok) {
            lastSaved.current = snap
            lastHydratedDraft.current = draftSnapshot(rowsToSave)
            if (mounted.current) {
              setSavedFlash(true)
              window.setTimeout(() => {
                if (mounted.current) setSavedFlash(false)
              }, 1400)
            }
            return true
          } else {
            if (lastQueued.current === snap) {
              lastQueued.current = lastSaved.current
            }
            if (mounted.current) toast.error(res.error)
            return false
          }
        } catch {
          if (lastQueued.current === snap) {
            lastQueued.current = lastSaved.current
          }
          if (mounted.current) {
            toast.error('Could not save this set. Please try again.')
          }
          return false
        }
      }

      return enqueueTrainingSave(saveKey, logicalSaveKey, save)
    },
    [
      saveKey,
      logicalSaveKey,
      sessionId,
      slot.id,
      targets.load,
      targets.reps,
      targets.rir,
      targets.sets,
      week,
    ],
  )

  React.useEffect(
    () =>
      registerTrainingSaveRetry(saveKey, logicalSaveKey, () =>
        queueRows(rowsRef.current, true),
      ),
    [logicalSaveKey, queueRows, saveKey],
  )

  function commitRows(rowsToSave: Row[]) {
    startTransition(async () => {
      await queueRows(rowsToSave)
    })
  }

  const commit = () => commitRows(rows)

  const performedSets = rows.filter((r) => num(r.reps) != null).length
  const hasData = performedSets > 0
  const toFailure = slot.is_bodyweight && slot.target_rir === 0
  const selectOnFocus = (e: React.FocusEvent<HTMLInputElement>) =>
    e.currentTarget.select()

  const inputCls =
    'h-11 w-full rounded-md border border-border bg-background px-1 text-center font-mono text-base font-semibold tabular-nums text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-surface'

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
            {slot.is_bodyweight ? (
              <Badge variant="muted" title="Bodyweight — progresses by reps & sets">
                BW
              </Badge>
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
          log={log}
          targets={targets}
        />
      </div>

      {/* Prescribed targets for the week */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2 px-4 pb-3">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
          Target
        </span>
        {slot.is_bodyweight ? (
          <Stat
            size="sm"
            label="Load"
            value={targets.load && targets.load > 0 ? `BW +${targets.load}` : 'BW'}
            unit={targets.load && targets.load > 0 ? unit : undefined}
          />
        ) : (
          <Stat size="sm" label="Load" value={targets.load} unit={unit} />
        )}
        <Stat size="sm" label="Sets" value={targets.sets} />
        <Stat
          size="sm"
          label="Reps"
          value={toFailure ? 'F' : targets.reps}
          placeholder="—"
        />
        <Stat
          size="sm"
          label="RIR"
          value={toFailure ? 'failure' : targets.rir}
        />
      </div>
      <Separator />

      {/* Per-set entry */}
      <div className="p-4 pt-3">
        <div className="mb-1.5 grid grid-cols-[1.75rem_1fr_1fr_1fr_1.75rem] items-center gap-1.5 px-0.5 text-[11px] font-medium uppercase tracking-wider text-muted">
          <span className="text-center">#</span>
          <span className="text-center">Load{unit ? ` ${unit}` : ''}</span>
          <span className="text-center">Reps</span>
          <span className="text-center">RIR</span>
          <span />
        </div>

        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div
              key={i}
              className="grid grid-cols-[1.75rem_1fr_1fr_1fr_1.75rem] items-center gap-1.5"
            >
              <span className="text-center font-mono text-sm font-semibold tabular-nums text-muted">
                {i + 1}
              </span>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                aria-label={`Set ${i + 1} load`}
                value={r.load}
                onChange={(e) => setField(i, 'load', e.target.value)}
                onFocus={selectOnFocus}
                onBlur={commit}
                placeholder="—"
                className={inputCls}
              />
              <input
                type="number"
                inputMode="numeric"
                step="1"
                min={1}
                aria-label={`Set ${i + 1} reps`}
                value={r.reps}
                onChange={(e) => setField(i, 'reps', e.target.value)}
                onFocus={selectOnFocus}
                onBlur={commit}
                placeholder="—"
                className={inputCls}
              />
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                aria-label={`Set ${i + 1} RIR`}
                value={r.rir}
                onChange={(e) => setField(i, 'rir', e.target.value)}
                onFocus={selectOnFocus}
                onBlur={commit}
                placeholder="—"
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => removeSet(i)}
                disabled={rows.length <= 1}
                aria-label={`Remove set ${i + 1}`}
                className="inline-flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:text-gate-red disabled:opacity-30"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={addSet}
          className="mt-2.5 h-10 w-full gap-1.5"
        >
          <Plus className="size-4" aria-hidden />
          Add set
        </Button>
      </div>

      {/* Decision readout — the signature element */}
      <div className="border-t border-border bg-background/40 px-4 py-3">
        {hasData ? (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-signal">
              <Sparkles className="size-3.5" aria-hidden />
              Next-session preview
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <DecisionBadge
                decision={result.decision}
                label={result.decisionLabel}
                reason={result.reason}
                className="min-w-0"
              />
              <div className="flex shrink-0 items-end gap-4">
                <Stat
                  size="sm"
                  label="Load"
                  value={result.nextLoad}
                  unit={unit}
                  precision={1}
                />
                <Stat size="sm" label="Sets" value={result.nextSets} />
                <Stat size="sm" label="Reps" value={result.nextReps} />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Stat
                size="sm"
                label="Session e1RM"
                value={result.e1rm}
                unit={unit}
                tone="signal"
                precision={1}
                animated
              />
              {result.gate ? (
                <Badge variant={GATE_BADGE[result.gate]}>{result.gate}</Badge>
              ) : null}
            </div>
            <p className="text-[11px] text-muted">
              Your logged sets, RIR, pump, pain, performance, and next-day
              soreness affect the next completed session—not today&apos;s target.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted">
            Log your sets and feedback to preview the next session.
          </p>
        )}
      </div>

      {/* Save status strip */}
      <div className="flex h-6 items-center justify-between px-4 pb-2 text-xs">
        <span className="font-mono text-muted">
          {performedSets} set{performedSets === 1 ? '' : 's'} logged
        </span>
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
