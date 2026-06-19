'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Pencil } from 'lucide-react'
import type { ExerciseSlot, Unit } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { SlotEditor } from './slot-editor'
import type { SlotEdit } from './program-editor'

/** Short tag for the progress bias so the mono summary stays tight. */
function biasTag(bias: ExerciseSlot['progress_bias']): string {
  switch (bias) {
    case 'Load +5':
      return 'load'
    case 'Reps first':
      return 'reps'
    case 'Set optional':
      return 'sets'
  }
}

export function SlotRow({
  slot,
  unit,
  isFirst,
  isLast,
  onSave,
  onRemove,
  onReorder,
}: {
  slot: ExerciseSlot
  unit: Unit
  isFirst: boolean
  isLast: boolean
  onSave: (edit: SlotEdit) => Promise<boolean>
  onRemove: (slotId: string) => Promise<boolean>
  onReorder: (direction: 'up' | 'down') => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)

  const reps =
    slot.rep_low === slot.rep_high
      ? `${slot.rep_low}`
      : `${slot.rep_low}–${slot.rep_high}`

  return (
    <li className="flex items-stretch">
      {/* Reorder controls */}
      <div className="flex flex-col justify-center gap-0.5 py-2 pl-2">
        <button
          type="button"
          aria-label="Move up"
          disabled={isFirst}
          onClick={() => onReorder('up')}
          className="flex h-6 w-7 items-center justify-center rounded text-muted hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:opacity-30"
        >
          <ChevronUp className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Move down"
          disabled={isLast}
          onClick={() => onReorder('down')}
          className="flex h-6 w-7 items-center justify-center rounded text-muted hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:opacity-30"
        >
          <ChevronDown className="size-4" aria-hidden />
        </button>
      </div>

      {/* Tap target: open the editor */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[3.25rem] flex-1 items-center gap-3 px-3 py-2.5 text-left hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal"
      >
        <span className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px] font-medium tracking-tight text-muted">
          {slot.slot_code}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">
            {slot.exercise_name}
          </span>
          <span className="mt-0.5 block truncate font-mono text-xs tabular-nums text-muted">
            {reps} reps · {biasTag(slot.progress_bias)} · {slot.base_sets}×
            {' · '}RIR {slot.target_rir}
            {slot.seed_load != null ? ` · ${slot.seed_load}${unit}` : ''}
          </span>
        </span>
        <Pencil className="size-4 shrink-0 text-muted" aria-hidden />
      </button>

      <SlotEditor
        slot={slot}
        unit={unit}
        open={open}
        onOpenChange={setOpen}
        onSave={onSave}
        onRemove={onRemove}
      />
    </li>
  )
}
