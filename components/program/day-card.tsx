'use client'

import { useState } from 'react'
import { Dumbbell, Loader2, Plus, Trash2 } from 'lucide-react'
import type { ExerciseSlot, ProgramDay, Unit } from '@/lib/types'
import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { SlotRow } from './slot-row'
import type { SlotEdit } from './program-editor'

export function DayCard({
  day,
  slots,
  unit,
  canRemove,
  onUpdateDay,
  onRemoveDay,
  onAddSlot,
  onSaveSlot,
  onRemoveSlot,
  onReorder,
}: {
  day: ProgramDay
  slots: ExerciseSlot[]
  unit: Unit
  canRemove: boolean
  onUpdateDay: (dayId: string, label: string, dayNumber: number) => Promise<boolean>
  onRemoveDay: (dayId: string) => Promise<boolean>
  onAddSlot: (dayId: string) => Promise<boolean>
  onSaveSlot: (edit: SlotEdit) => Promise<boolean>
  onRemoveSlot: (slotId: string) => Promise<boolean>
  onReorder: (
    dayId: string,
    slotId: string,
    direction: 'up' | 'down',
  ) => Promise<boolean>
}) {
  const [label, setLabel] = useState(day.label)
  const [dayNumber, setDayNumber] = useState(String(day.day_number))
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState(false)

  async function commitDay() {
    const trimmed = label.trim()
    const num = Number(dayNumber)
    const unchanged = trimmed === day.label && num === day.day_number
    if (!trimmed || !Number.isFinite(num) || unchanged) {
      setLabel(day.label)
      setDayNumber(String(day.day_number))
      return
    }
    const ok = await onUpdateDay(day.id, trimmed, num)
    if (!ok) {
      setLabel(day.label)
      setDayNumber(String(day.day_number))
    }
  }

  async function handleAdd() {
    setAdding(true)
    await onAddSlot(day.id)
    setAdding(false)
  }

  async function handleRemoveDay() {
    setRemoving(true)
    await onRemoveDay(day.id)
    setRemoving(false)
  }

  return (
    <Card>
      <CardHeader className="gap-3 pb-3">
        <div className="flex items-end gap-2">
          <div className="w-14 shrink-0 space-y-1.5">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
              Day
            </span>
            <Input
              aria-label="Day number"
              type="number"
              inputMode="numeric"
              min={1}
              max={14}
              value={dayNumber}
              onChange={(e) => setDayNumber(e.target.value)}
              onBlur={commitDay}
              onFocus={(e) => e.currentTarget.select()}
              className="h-11 px-2 text-center font-mono tabular-nums"
            />
          </div>
          <div className="flex-1 space-y-1.5">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
              Label
            </span>
            <Input
              aria-label="Day label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={commitDay}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
              maxLength={80}
              placeholder="Push / Pull / Legs…"
              className="font-medium"
            />
          </div>

          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove day"
                disabled={!canRemove}
                className="shrink-0 text-muted hover:text-gate-red"
              >
                <Trash2 aria-hidden />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Remove this day?</DialogTitle>
                <DialogDescription>
                  “{day.label}” and its {slots.length}{' '}
                  {slots.length === 1 ? 'exercise' : 'exercises'} will be deleted.
                  Logged sessions for this day are removed too. This can’t be
                  undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="secondary">Keep day</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button
                    variant="destructive"
                    onClick={handleRemoveDay}
                    disabled={removing}
                  >
                    {removing ? (
                      <Loader2 className="animate-spin" aria-hidden />
                    ) : (
                      <Trash2 aria-hidden />
                    )}
                    Remove day
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <Separator />

      <CardContent className="p-0">
        {slots.length === 0 ? (
          <div className="flex flex-col items-center gap-1 px-4 py-8 text-center">
            <Dumbbell className="size-5 text-muted" aria-hidden />
            <p className="text-sm text-muted">
              No exercises yet. Add the first movement for this day.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {slots.map((slot, i) => (
              <SlotRow
                key={slot.id}
                slot={slot}
                unit={unit}
                isFirst={i === 0}
                isLast={i === slots.length - 1}
                onSave={onSaveSlot}
                onRemove={onRemoveSlot}
                onReorder={(direction) => onReorder(day.id, slot.id, direction)}
              />
            ))}
          </ul>
        )}
      </CardContent>

      <div className="p-3 pt-0">
        <Button
          variant="outline"
          className="w-full"
          onClick={handleAdd}
          disabled={adding}
        >
          {adding ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Plus aria-hidden />
          )}
          Add exercise
        </Button>
      </div>
    </Card>
  )
}
