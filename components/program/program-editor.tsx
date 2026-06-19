'use client'

import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import type { ExerciseSlot, ProgramDay, ProgramFull, Unit } from '@/lib/types'
import type { ProgressBias } from '@/lib/engine/engine'
import { Button } from '@/components/ui/button'
import {
  addDay,
  addSlot,
  removeDay,
  removeSlot,
  renameProgram,
  reorderSlot,
  updateDay,
  updateProgramMeta,
  updateSlot,
  type ActionResult,
} from '@/app/(app)/program/actions'
import { ProgramHeader } from './program-header'
import { DayCard } from './day-card'

/** Fields the slot editor sends back when saving a slot. */
export interface SlotEdit {
  slotId: string
  slotCode: string
  orderIndex: number
  exerciseName: string
  muscleArea: string | null
  progressBias: ProgressBias
  repLow: number
  repHigh: number
  targetRir: number
  baseSets: number
  loadIncrement: number
  seedLoad: number | null
}

function byDayNumber(a: ProgramDay, b: ProgramDay) {
  return a.day_number - b.day_number || a.label.localeCompare(b.label)
}
function byOrder(a: ExerciseSlot, b: ExerciseSlot) {
  return a.order_index - b.order_index
}

export function ProgramEditor({
  initial,
  unit,
}: {
  initial: ProgramFull
  unit: Unit
}) {
  const [program, setProgram] = useState(initial.program)
  const [days, setDays] = useState<ProgramDay[]>(
    [...initial.days].sort(byDayNumber),
  )
  const [slots, setSlots] = useState<ExerciseSlot[]>(
    [...initial.slots].sort(byOrder),
  )

  // Toast on the action result; return ok so callers can branch (close sheet…).
  const settle = useCallback(
    <T,>(res: ActionResult<T>, successMsg: string): res is { ok: true; data: T } => {
      if (res.ok) toast.success(successMsg)
      else toast.error(res.error)
      return res.ok
    },
    [],
  )

  /* ----- program meta ----- */

  const onRenameProgram = useCallback(
    async (name: string) => {
      const prev = program
      setProgram((p) => ({ ...p, name })) // optimistic
      const res = await renameProgram({ programId: program.id, name })
      if (!settle(res, 'Program renamed.')) setProgram(prev)
      return res.ok
    },
    [program, settle],
  )

  const onUpdateMeta = useCallback(
    async (lengthWeeks: number, deloadWeek: number) => {
      const prev = program
      setProgram((p) => ({
        ...p,
        length_weeks: lengthWeeks,
        deload_week: deloadWeek,
      }))
      const res = await updateProgramMeta({
        programId: program.id,
        lengthWeeks,
        deloadWeek,
      })
      if (!settle(res, 'Program updated.')) setProgram(prev)
      return res.ok
    },
    [program, settle],
  )

  /* ----- days ----- */

  const onAddDay = useCallback(async () => {
    const res = await addDay({ programId: program.id })
    if (settle(res, 'Day added.')) {
      setDays((d) => [...d, res.data].sort(byDayNumber))
    }
    return res.ok
  }, [program.id, settle])

  const onUpdateDay = useCallback(
    async (dayId: string, label: string, dayNumber: number) => {
      const prev = days
      setDays((d) =>
        d
          .map((x) => (x.id === dayId ? { ...x, label, day_number: dayNumber } : x))
          .sort(byDayNumber),
      )
      const res = await updateDay({ dayId, label, dayNumber })
      if (!settle(res, 'Day updated.')) setDays(prev)
      return res.ok
    },
    [days, settle],
  )

  const onRemoveDay = useCallback(
    async (dayId: string) => {
      const prevDays = days
      const prevSlots = slots
      setDays((d) => d.filter((x) => x.id !== dayId))
      setSlots((s) => s.filter((x) => x.day_id !== dayId))
      const res = await removeDay({ dayId })
      if (!settle(res, 'Day removed.')) {
        setDays(prevDays)
        setSlots(prevSlots)
      }
      return res.ok
    },
    [days, slots, settle],
  )

  /* ----- slots ----- */

  const onAddSlot = useCallback(
    async (dayId: string) => {
      const res = await addSlot({ dayId })
      if (settle(res, 'Exercise added.')) {
        setSlots((s) => [...s, res.data])
      }
      return res.ok
    },
    [settle],
  )

  const onSaveSlot = useCallback(
    async (edit: SlotEdit) => {
      const prev = slots
      setSlots((s) =>
        s.map((x) =>
          x.id === edit.slotId
            ? {
                ...x,
                slot_code: edit.slotCode,
                order_index: edit.orderIndex,
                exercise_name: edit.exerciseName,
                muscle_area: edit.muscleArea,
                progress_bias: edit.progressBias,
                rep_low: edit.repLow,
                rep_high: edit.repHigh,
                target_rir: edit.targetRir,
                base_sets: edit.baseSets,
                load_increment: edit.loadIncrement,
                seed_load: edit.seedLoad,
              }
            : x,
        ),
      )
      const res = await updateSlot(edit)
      if (!settle(res, 'Exercise saved.')) setSlots(prev)
      return res.ok
    },
    [slots, settle],
  )

  const onRemoveSlot = useCallback(
    async (slotId: string) => {
      const prev = slots
      setSlots((s) => s.filter((x) => x.id !== slotId))
      const res = await removeSlot({ slotId })
      if (!settle(res, 'Exercise removed.')) setSlots(prev)
      return res.ok
    },
    [slots, settle],
  )

  const onReorder = useCallback(
    async (dayId: string, slotId: string, direction: 'up' | 'down') => {
      const prev = slots
      // Optimistic swap of order_index with the neighbour in this day.
      const inDay = slots
        .filter((s) => s.day_id === dayId)
        .sort(byOrder)
      const idx = inDay.findIndex((s) => s.id === slotId)
      const swapWith = direction === 'up' ? idx - 1 : idx + 1
      if (idx === -1 || swapWith < 0 || swapWith >= inDay.length) return false

      const a = inDay[idx]
      const b = inDay[swapWith]
      setSlots((s) =>
        s.map((x) =>
          x.id === a.id
            ? { ...x, order_index: b.order_index }
            : x.id === b.id
              ? { ...x, order_index: a.order_index }
              : x,
        ),
      )
      const res = await reorderSlot({ dayId, slotId, direction })
      if (!res.ok) {
        toast.error(res.error)
        setSlots(prev)
      }
      return res.ok
    },
    [slots],
  )

  const slotsByDay = useMemo(() => {
    const map = new Map<string, ExerciseSlot[]>()
    for (const d of days) map.set(d.id, [])
    for (const s of slots) {
      const arr = map.get(s.day_id)
      if (arr) arr.push(s)
    }
    for (const arr of map.values()) arr.sort(byOrder)
    return map
  }, [days, slots])

  return (
    <div className="mx-auto w-full max-w-3xl pb-28 sm:pb-12">
      <header className="mb-5">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
          Program editor
        </span>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Build your program
        </h1>
        <p className="mt-1 text-sm text-muted">
          Shape the days and exercises the engine will autoregulate. Changes save
          as you go.
        </p>
      </header>

      <ProgramHeader
        program={program}
        unit={unit}
        onRename={onRenameProgram}
        onUpdateMeta={onUpdateMeta}
      />

      <div className="mt-5 space-y-4">
        {days.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface/40 p-8 text-center">
            <p className="text-sm text-muted">
              No training days yet. Add your first day to start placing exercises.
            </p>
            <Button className="mt-4" onClick={onAddDay}>
              <Plus aria-hidden /> Add day
            </Button>
          </div>
        ) : (
          days.map((day) => (
            <DayCard
              key={day.id}
              day={day}
              slots={slotsByDay.get(day.id) ?? []}
              unit={unit}
              canRemove={days.length > 1}
              onUpdateDay={onUpdateDay}
              onRemoveDay={onRemoveDay}
              onAddSlot={onAddSlot}
              onSaveSlot={onSaveSlot}
              onRemoveSlot={onRemoveSlot}
              onReorder={onReorder}
            />
          ))
        )}
      </div>

      {days.length > 0 ? (
        <div className="mt-6">
          <Button variant="outline" className="w-full" onClick={onAddDay}>
            <Plus aria-hidden /> Add day
          </Button>
        </div>
      ) : null}
    </div>
  )
}
