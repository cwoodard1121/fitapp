'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Check, Loader2, Plus, X } from 'lucide-react'

import type { SlotView, Unit } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Stat } from '@/components/ui/stat'
import { DecisionBadge } from '@/components/ui/decision-badge'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { announceSlotProgress } from '@/lib/client/slot-progress'
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

  // Tell the session rail as soon as reps land, ahead of the save round-trip.
  const announcedSets = React.useRef(performedSets)
  React.useEffect(() => {
    if (announcedSets.current === performedSets) return
    announcedSets.current = performedSets
    announceSlotProgress({ slotId: slot.id, performedSets })
  }, [performedSets, slot.id])
  const toFailure = slot.is_bodyweight && slot.target_rir === 0
  const selectOnFocus = (e: React.FocusEvent<HTMLInputElement>) =>
    e.currentTarget.select()

  const inputCls =
    'h-12 w-full min-w-0 rounded-md border border-border bg-surface px-1 text-center font-mono text-lg font-bold text-foreground placeholder:font-medium placeholder:text-muted transition-colors focus-visible:border-signal focus-visible:bg-signal/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/25'
  const gridCls = 'grid grid-cols-[2.25rem_1fr_1fr_1fr_2.75rem] items-center gap-2'

  const loadTarget = slot.is_bodyweight
    ? targets.load && targets.load > 0
      ? `bw +${targets.load}`
      : 'bw'
    : targets.load ?? '—'

  return (
    <article
      id={`slot-${slot.id}`}
      className="scroll-mt-[4.5rem] overflow-hidden rounded-lg border border-border bg-surface transition-[border-color,box-shadow] duration-200 focus-within:border-signal/50 focus-within:shadow-[0_0_0_4px_rgb(var(--signal-rgb)/0.10)]"
    >
      <header className="flex items-start justify-between gap-3 p-4 pb-1.5">
        <h3 className="flex min-w-0 items-baseline gap-2 pt-1.5 text-lg font-bold leading-snug tracking-[-0.01em]">
          <span className="relative -top-px shrink-0 rounded-sm bg-foreground px-1.5 py-1 font-mono text-xs font-bold leading-none text-background">
            {slot.slot_code}
          </span>
          <span className="min-w-0">{slot.exercise_name}</span>
        </h3>
        <ReadinessSheet
          sessionId={sessionId}
          slotId={slot.id}
          week={week}
          exerciseName={slot.exercise_name}
          slotCode={slot.slot_code}
          log={log}
          targets={targets}
        />
      </header>

      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-4 pb-4 font-mono">
        <span className="text-xs font-semibold text-muted">target</span>
        <span className="text-[1.0625rem] font-bold">
          {loadTarget}
          {!slot.is_bodyweight || (targets.load && targets.load > 0) ? (
            <span className="ml-0.5 text-xs font-semibold text-muted">{unit}</span>
          ) : null}
        </span>
        <span className="text-muted" aria-hidden>
          ·
        </span>
        <span className="text-[1.0625rem] font-bold">
          {targets.sets ?? '—'}
          <span className="mx-0.5 text-sm text-muted">×</span>
          {toFailure ? 'f' : targets.reps ?? '—'}
        </span>
        <span className="text-muted" aria-hidden>
          ·
        </span>
        <span className="text-[1.0625rem] font-bold">
          {toFailure ? 'to failure' : targets.rir ?? '—'}
          {toFailure ? null : (
            <span className="ml-0.5 text-xs font-semibold text-muted">rir</span>
          )}
        </span>
        {slot.muscle_area ? (
          <>
            <span className="text-muted" aria-hidden>
              ·
            </span>
            <span className="font-sans text-xs font-semibold lowercase text-muted">
              {slot.muscle_area}
            </span>
          </>
        ) : null}
      </p>

      <div className="px-4 pb-4">
        <div className={cn(gridCls, 'mb-1.5 text-xs font-semibold text-muted')}>
          <span className="text-center">set</span>
          <span className="text-center">{unit}</span>
          <span className="text-center">reps</span>
          <span className="text-center">rir</span>
          <span />
        </div>

        <div className="space-y-2">
          {rows.map((r, i) => {
            const performed = num(r.reps) != null
            return (
              <div key={i} className={gridCls}>
                <span
                  className={cn(
                    'mx-auto inline-flex size-8 items-center justify-center rounded-full font-mono text-sm font-bold',
                    performed
                      ? 'animate-set-mark bg-signal text-signal-foreground'
                      : 'border-2 border-border text-muted',
                  )}
                  aria-hidden
                >
                  {i + 1}
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  enterKeyHint="next"
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
                  enterKeyHint="next"
                  step="1"
                  min={1}
                  aria-label={`Set ${i + 1} reps`}
                  value={r.reps}
                  onChange={(e) => setField(i, 'reps', e.target.value)}
                  onFocus={selectOnFocus}
                  onBlur={commit}
                  placeholder={targets.reps != null ? String(targets.reps) : '—'}
                  className={inputCls}
                />
                <input
                  type="number"
                  inputMode="decimal"
                  enterKeyHint="done"
                  step="any"
                  min={0}
                  aria-label={`Set ${i + 1} RIR`}
                  value={r.rir}
                  onChange={(e) => setField(i, 'rir', e.target.value)}
                  onFocus={selectOnFocus}
                  onBlur={commit}
                  placeholder={targets.rir != null ? String(targets.rir) : '—'}
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={() => removeSet(i)}
                  disabled={rows.length <= 1}
                  aria-label={`Remove set ${i + 1}`}
                  className="inline-flex size-11 items-center justify-center rounded-md text-muted transition-colors hover:bg-gate-red/10 hover:text-gate-red active:scale-95 disabled:pointer-events-none disabled:opacity-25"
                >
                  <X className="size-[1.125rem]" aria-hidden />
                </button>
              </div>
            )
          })}
        </div>

        <Button
          type="button"
          variant="secondary"
          onClick={addSet}
          className="mt-3 w-full"
        >
          <Plus aria-hidden />
          add set
        </Button>
      </div>

      <div className="border-t border-border bg-surface-2/60 px-4 py-4">
        {hasData ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1.5">
                <p className="text-xs font-semibold text-muted">next session</p>
                <DecisionBadge
                  decision={result.decision}
                  label={result.decisionLabel}
                  reason={result.reason}
                  className="min-w-0"
                />
              </div>
              <div className="flex shrink-0 items-end gap-4">
                <Stat
                  size="sm"
                  label="load"
                  value={result.nextLoad}
                  unit={unit}
                  precision={1}
                />
                <Stat size="sm" label="sets" value={result.nextSets} />
                <Stat size="sm" label="reps" value={result.nextReps} />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Stat
                size="sm"
                label="session e1rm"
                value={result.e1rm}
                unit={unit}
                tone="signal"
                precision={1}
                animated
              />
              {result.gate ? (
                <Badge variant={GATE_BADGE[result.gate]}>
                  {result.gate.toLowerCase()} gate
                </Badge>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">
            Log a set to preview next session&apos;s call.
          </p>
        )}

        <div className="mt-3 flex h-5 items-center justify-between text-xs">
          <span className="font-mono font-semibold text-muted">
            {performedSets}/{rows.length} sets
          </span>
          {pending ? (
            <span className="inline-flex items-center gap-1 font-semibold text-muted">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              saving
            </span>
          ) : savedFlash ? (
            <span className="inline-flex items-center gap-1 font-semibold text-gate-green">
              <Check className="size-3.5" strokeWidth={3} aria-hidden />
              saved
            </span>
          ) : null}
        </div>
      </div>
    </article>
  )
}
