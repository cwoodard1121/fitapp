'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, Library, Loader2, Save, Search, Trash2 } from 'lucide-react'
import type { ExerciseSlot, Unit } from '@/lib/types'
import type { ProgressBias } from '@/lib/engine/engine'
import {
  type CatalogExercise,
  groupCatalogByMuscle,
  searchCatalog,
} from '@/lib/exercises/catalog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { SlotEdit } from './program-editor'

const BIAS_HELP: Record<ProgressBias, string> = {
  'Load +5': 'Add load when the set comes in easy.',
  'Reps first': 'Climb the rep range, then convert to load.',
  'Set optional': 'Add a set to drive more volume.',
}

const BIAS_OPTIONS: { value: ProgressBias; label: string }[] = [
  { value: 'Load +5', label: 'Load +5' },
  { value: 'Reps first', label: 'Reps first' },
  { value: 'Set optional', label: 'Set optional' },
]

function ExerciseLibraryPicker({
  groups,
  query,
  onQuery,
  onPick,
  onBack,
}: {
  groups: ReturnType<typeof groupCatalogByMuscle>
  query: string
  onQuery: (query: string) => void
  onPick: (exercise: CatalogExercise) => void
  onBack: () => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SheetHeader className="px-5 pb-3 pt-5 text-left">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onBack}
            aria-label="Back to exercise editor"
          >
            <ArrowLeft aria-hidden />
          </Button>
          <div>
            <SheetTitle>Exercise library</SheetTitle>
            <SheetDescription>Pick a movement to fill its defaults.</SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="px-5 pb-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search by name or muscle"
            aria-label="Search the exercise library"
            autoFocus
            className="pl-9"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        {groups.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            No exercises match &ldquo;{query.trim()}&rdquo;.
          </p>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.muscleArea} className="space-y-1.5">
                <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                  {group.muscleArea}
                </h3>
                <ul className="space-y-1">
                  {group.exercises.map((exercise) => (
                    <li key={exercise.name}>
                      <button
                        type="button"
                        onClick={() => onPick(exercise)}
                        className="flex w-full items-center gap-2 rounded-md border border-border bg-background/40 px-3 py-2 text-left transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {exercise.name}
                          </span>
                          <span className="block truncate text-xs text-muted">
                            {exercise.muscleArea} · {exercise.repLow}–{exercise.repHigh} reps ·{' '}
                            {exercise.progressBias}
                          </span>
                        </span>
                        {exercise.isBodyweight ? <Badge variant="secondary">BW</Badge> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function SlotEditor({
  slot,
  unit,
  open,
  onOpenChange,
  onSave,
  onRemove,
}: {
  slot: ExerciseSlot
  unit: Unit
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (edit: SlotEdit) => Promise<boolean>
  onRemove: (slotId: string) => Promise<boolean>
}) {
  const [name, setName] = useState(slot.exercise_name)
  const [muscle, setMuscle] = useState(slot.muscle_area ?? '')
  const [bias, setBias] = useState<ProgressBias>(slot.progress_bias)
  const [repLow, setRepLow] = useState(String(slot.rep_low))
  const [repHigh, setRepHigh] = useState(String(slot.rep_high))
  const [rir, setRir] = useState(String(slot.target_rir))
  const [sets, setSets] = useState(String(slot.base_sets))
  const [increment, setIncrement] = useState(String(slot.load_increment))
  const [seed, setSeed] = useState(slot.seed_load == null ? '' : String(slot.seed_load))
  const [bodyweight, setBodyweight] = useState(slot.is_bodyweight)
  const [code, setCode] = useState(slot.slot_code)
  const [order, setOrder] = useState(String(slot.order_index))
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [query, setQuery] = useState('')

  const pickerGroups = useMemo(
    () => groupCatalogByMuscle(searchCatalog(query)),
    [query],
  )

  // Fill the form from a library pick; the user can still tweak any field after.
  function applyCatalog(ex: CatalogExercise) {
    setName(ex.name)
    setMuscle(ex.muscleArea)
    setBias(ex.progressBias)
    setRepLow(String(ex.repLow))
    setRepHigh(String(ex.repHigh))
    setIncrement(String(ex.loadIncrement))
    setBodyweight(ex.isBodyweight)
    setPickerOpen(false)
    setQuery('')
  }

  // Re-sync the form from the slot each time the sheet opens.
  useEffect(() => {
    if (!open) return
    setPickerOpen(false)
    setQuery('')
    setName(slot.exercise_name)
    setMuscle(slot.muscle_area ?? '')
    setBias(slot.progress_bias)
    setRepLow(String(slot.rep_low))
    setRepHigh(String(slot.rep_high))
    setRir(String(slot.target_rir))
    setSets(String(slot.base_sets))
    setIncrement(String(slot.load_increment))
    setSeed(slot.seed_load == null ? '' : String(slot.seed_load))
    setBodyweight(slot.is_bodyweight)
    setCode(slot.slot_code)
    setOrder(String(slot.order_index))
  }, [open, slot])

  async function handleSave() {
    const lo = Number(repLow)
    const hi = Number(repHigh)
    if (!name.trim()) {
      toast.error('Name the exercise.')
      return
    }
    if (!code.trim()) {
      toast.error('Slot code is required.')
      return
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) {
      toast.error('Check the rep range — top must be ≥ bottom.')
      return
    }

    setSaving(true)
    const ok = await onSave({
      slotId: slot.id,
      slotCode: code.trim(),
      orderIndex: Number(order),
      exerciseName: name.trim(),
      muscleArea: muscle.trim() ? muscle.trim() : null,
      progressBias: bias,
      repLow: lo,
      repHigh: hi,
      targetRir: Number(rir),
      baseSets: Number(sets),
      loadIncrement: Number(increment),
      seedLoad: seed.trim() === '' ? null : Number(seed),
      isBodyweight: bodyweight,
    })
    setSaving(false)
    if (ok) onOpenChange(false)
  }

  async function handleRemove() {
    setRemoving(true)
    const ok = await onRemove(slot.id)
    setRemoving(false)
    if (ok) onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[92vh] flex-col gap-0 overflow-y-auto rounded-t-xl p-0 sm:mx-auto sm:max-w-lg"
      >
        {pickerOpen ? (
          <ExerciseLibraryPicker
            groups={pickerGroups}
            query={query}
            onQuery={setQuery}
            onPick={applyCatalog}
            onBack={() => setPickerOpen(false)}
          />
        ) : (
          <>
            <SheetHeader className="px-5 pb-3 pt-5 text-left">
              <div className="flex items-center gap-2">
                <span className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted">
                  {slot.slot_code}
                </span>
                <SheetTitle>Edit exercise</SheetTitle>
              </div>
              <SheetDescription>Tune how the engine progresses this slot.</SheetDescription>
            </SheetHeader>

        <div className="space-y-4 px-5 pb-4">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start"
            onClick={() => setPickerOpen(true)}
          >
            <Library aria-hidden />
            Choose from library
          </Button>

          <div className="space-y-1.5">
            <Label htmlFor="ex-name">Exercise</Label>
            <Input
              id="ex-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="DB incline bench"
              autoCapitalize="words"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ex-muscle">Muscle area</Label>
              <Input
                id="ex-muscle"
                value={muscle}
                onChange={(e) => setMuscle(e.target.value)}
                maxLength={40}
                placeholder="Upper chest"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-code">Slot code</Label>
              <Input
                id="ex-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={16}
                className="font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ex-bias">Progress bias</Label>
            <Select
              value={bias}
              onValueChange={(v) => setBias(v as ProgressBias)}
            >
              <SelectTrigger id="ex-bias">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BIAS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted">{BIAS_HELP[bias]}</p>
          </div>

          <div className="space-y-1.5">
            <Label>Rep range</Label>
            <div className="flex items-center gap-2">
              <Input
                aria-label="Lowest reps"
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                value={repLow}
                onChange={(e) => setRepLow(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono tabular-nums"
              />
              <span className="font-mono text-muted">–</span>
              <Input
                aria-label="Highest reps"
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                value={repHigh}
                onChange={(e) => setRepHigh(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono tabular-nums"
              />
            </div>
            <p className="text-xs text-muted">
              Set both equal for a fixed target.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ex-rir">Target RIR</Label>
              <Input
                id="ex-rir"
                type="number"
                inputMode="decimal"
                min={0}
                max={10}
                step={0.5}
                value={rir}
                onChange={(e) => setRir(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-sets">Base sets</Label>
              <Input
                id="ex-sets"
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                value={sets}
                onChange={(e) => setSets(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ex-inc">Load step ({unit})</Label>
              <Input
                id="ex-inc"
                type="number"
                inputMode="decimal"
                min={0.1}
                step={0.5}
                value={increment}
                onChange={(e) => setIncrement(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-seed">
                {bodyweight ? `Added load (${unit})` : `Seed load (${unit})`}
              </Label>
              <Input
                id="ex-seed"
                type="number"
                inputMode="decimal"
                min={0}
                placeholder={bodyweight ? 'None (just bodyweight)' : 'Bodyweight'}
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono tabular-nums"
              />
            </div>
          </div>

          {/* Bodyweight toggle — reps/sets only, never an auto load bump */}
          <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background/40 p-3">
            <div className="space-y-0.5">
              <Label htmlFor="ex-bodyweight" className="cursor-pointer">
                Bodyweight movement
              </Label>
              <p className="text-xs text-muted">
                Pull-ups, dips, etc. The engine progresses reps then sets and never
                auto-adds weight — you log any added load (belt) yourself.
              </p>
            </div>
            <Switch
              id="ex-bodyweight"
              checked={bodyweight}
              onCheckedChange={setBodyweight}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ex-order">Order index</Label>
            <Input
              id="ex-order"
              type="number"
              inputMode="numeric"
              min={0}
              value={order}
              onChange={(e) => setOrder(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              className="w-24 font-mono tabular-nums"
            />
            <p className="text-xs text-muted">
              Lower shows first. The up/down arrows adjust this for you.
            </p>
          </div>
            </div>

        {/* Sticky action bar — trailing pad clears the home indicator. */}
            <div className="sticky bottom-0 flex items-center gap-2 border-t border-border bg-surface px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <Button
            variant="ghost"
            onClick={handleRemove}
            disabled={removing || saving}
            className="text-muted hover:text-gate-red"
          >
            {removing ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Trash2 aria-hidden />
            )}
            Delete
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || removing}
            className="ml-auto min-w-28"
          >
            {saving ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Save aria-hidden />
            )}
            Save
          </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
