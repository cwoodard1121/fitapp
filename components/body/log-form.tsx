'use client'

import * as React from 'react'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { BodyMetric, Unit } from '@/lib/types'
import { upsertBodyMetric } from '@/app/(app)/body/actions'

interface LogFormProps {
  unit: Unit
  /** Default measured_on (yyyy-MM-dd), usually today. */
  defaultDate: string
  /** Existing entry to edit; null when logging a fresh weigh-in. */
  initial?: BodyMetric | null
  onDone?: () => void
}

function selectOnFocus(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.select()
}

export function LogForm({ unit, defaultDate, initial, onDone }: LogFormProps) {
  const [isPending, startTransition] = useTransition()

  const [measuredOn, setMeasuredOn] = React.useState(initial?.measured_on ?? defaultDate)
  const [weight, setWeight] = React.useState(
    initial?.bodyweight != null ? String(initial.bodyweight) : '',
  )
  const [bodyfat, setBodyfat] = React.useState(
    initial?.bodyfat_pct != null ? String(initial.bodyfat_pct) : '',
  )
  const [notes, setNotes] = React.useState(initial?.notes ?? '')

  const weightRef = React.useRef<HTMLInputElement>(null)

  // One-tap fast: focus + select the weight field as soon as the form mounts.
  React.useEffect(() => {
    const t = window.setTimeout(() => {
      weightRef.current?.focus()
      weightRef.current?.select()
    }, 50)
    return () => window.clearTimeout(t)
  }, [])

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const w = Number.parseFloat(weight)
    if (!Number.isFinite(w) || w <= 0) {
      toast.error('Enter your weight to log a weigh-in.')
      weightRef.current?.focus()
      return
    }
    const bfRaw = bodyfat.trim()
    const bf = bfRaw === '' ? null : Number.parseFloat(bfRaw)
    if (bf != null && !Number.isFinite(bf)) {
      toast.error('Body fat must be a number, or leave it blank.')
      return
    }

    startTransition(async () => {
      const res = await upsertBodyMetric({
        measured_on: measuredOn,
        bodyweight: w,
        bodyfat_pct: bf,
        notes: notes.trim() || null,
      })
      if (res.ok) {
        toast.success(initial ? 'Weigh-in updated.' : 'Weigh-in logged.')
        onDone?.()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="bm-weight">Weight ({unit})</Label>
          <Input
            id="bm-weight"
            ref={weightRef}
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            required
            placeholder="0.0"
            value={weight}
            onFocus={selectOnFocus}
            onChange={(e) => setWeight(e.target.value)}
            disabled={isPending}
            className="h-12 font-mono tabular-nums text-base"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bm-bodyfat">
            Body fat % <span className="text-muted">· optional</span>
          </Label>
          <Input
            id="bm-bodyfat"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            placeholder="—"
            value={bodyfat}
            onFocus={selectOnFocus}
            onChange={(e) => setBodyfat(e.target.value)}
            disabled={isPending}
            className="h-12 font-mono tabular-nums text-base"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="bm-date">Date</Label>
        <Input
          id="bm-date"
          type="date"
          value={measuredOn}
          onChange={(e) => setMeasuredOn(e.target.value)}
          disabled={isPending}
          className="h-12 font-mono tabular-nums"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="bm-notes">
          Notes <span className="text-muted">· optional</span>
        </Label>
        <Textarea
          id="bm-notes"
          placeholder="Morning, fasted, post-deload…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={isPending}
          className="min-h-16"
        />
      </div>

      <Button type="submit" size="touch" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            Saving
          </>
        ) : initial ? (
          'Save changes'
        ) : (
          "Log today's weight"
        )}
      </Button>
    </form>
  )
}
