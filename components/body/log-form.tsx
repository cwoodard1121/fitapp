'use client'

import * as React from 'react'
import Link from 'next/link'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  biaBodyFatPct,
  navyMeasurementInISOWeek,
} from '@/lib/body/body-fat'
import type { BodyMetric, Unit } from '@/lib/types'
import { upsertBodyMetric } from '@/app/(app)/body/actions'

interface LogFormProps {
  unit: Unit
  heightCm: number | null
  entries: BodyMetric[]
  /** Default measured_on (yyyy-MM-dd), usually today. */
  defaultDate: string
  /** Existing entry to edit; null when logging a fresh weigh-in. */
  initial?: BodyMetric | null
  onDone?: () => void
}

function selectOnFocus(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.select()
}

function displayCircumference(valueCm: number | null | undefined) {
  if (valueCm == null) return ''
  return String(Math.round(valueCm * 10) / 10)
}

export function LogForm({
  unit,
  heightCm,
  entries,
  defaultDate,
  initial,
  onDone,
}: LogFormProps) {
  const [isPending, startTransition] = useTransition()

  const [measuredOn, setMeasuredOn] = React.useState(initial?.measured_on ?? defaultDate)
  const [weight, setWeight] = React.useState(
    initial?.bodyweight != null ? String(initial.bodyweight) : '',
  )
  const initialBia = initial
    ? biaBodyFatPct(initial)
    : null
  const [bodyfat, setBodyfat] = React.useState(
    initialBia != null ? String(initialBia) : '',
  )
  const [neck, setNeck] = React.useState(
    displayCircumference(initial?.neck_cm),
  )
  const [waist, setWaist] = React.useState(
    displayCircumference(initial?.waist_cm),
  )
  const [notes, setNotes] = React.useState(initial?.notes ?? '')

  const weightRef = React.useRef<HTMLInputElement>(null)
  const weeklyMeasurement = React.useMemo(
    () => navyMeasurementInISOWeek(entries, measuredOn, initial?.id),
    [entries, measuredOn, initial?.id],
  )

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
      toast.error('BIA body fat must be a number, or leave it blank.')
      return
    }

    const wantsNavyMeasurement = neck.trim() !== '' || waist.trim() !== ''
    let neckCm: number | null = null
    let waistCm: number | null = null
    if (wantsNavyMeasurement) {
      const parsedNeck = Number.parseFloat(neck)
      const parsedWaist = Number.parseFloat(waist)
      if (!Number.isFinite(parsedNeck) || !Number.isFinite(parsedWaist)) {
        toast.error('Enter neck and waist in centimeters.')
        return
      }
      if (heightCm == null) {
        toast.error('Set your height in Settings before logging the weekly tape.')
        return
      }
      neckCm = parsedNeck
      waistCm = parsedWaist
      if (waistCm <= neckCm) {
        toast.error('Waist must be larger than neck for the Navy calculation.')
        return
      }
    }

    startTransition(async () => {
      const res = await upsertBodyMetric({
        measured_on: measuredOn,
        bodyweight: w,
        bodyfat_pct: bf,
        neck_cm: neckCm,
        waist_cm: waistCm,
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
            BIA body fat % <span className="text-muted">· optional</span>
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

      <div className="space-y-3 rounded-md border border-border bg-background/50 p-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>Weekly Navy tape</Label>
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
              once per week
            </span>
          </div>
          <p className="text-xs leading-relaxed text-muted">
            Measure in centimeters: neck just below the larynx and waist across
            the navel after a normal exhale.{' '}
            {heightCm != null ? (
              <>Using your {heightCm} cm height from Settings.</>
            ) : (
              <Link href="/settings" className="font-medium text-signal hover:underline">
                Set your height in Settings first.
              </Link>
            )}
          </p>
        </div>

        {weeklyMeasurement ? (
          <p className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted">
            Navy tape already logged this week on{' '}
            <span className="font-mono text-foreground">
              {weeklyMeasurement.measured_on}
            </span>
            . Edit that entry to change it.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bm-neck">Neck (cm)</Label>
              <Input
                id="bm-neck"
                type="number"
                inputMode="decimal"
                step="0.1"
                min="15"
                max="100"
                placeholder="—"
                value={neck}
                onFocus={selectOnFocus}
                onChange={(e) => setNeck(e.target.value)}
                disabled={isPending}
                className="h-11 font-mono tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bm-waist">Waist (cm)</Label>
              <Input
                id="bm-waist"
                type="number"
                inputMode="decimal"
                step="0.1"
                min="30"
                max="250"
                placeholder="—"
                value={waist}
                onFocus={selectOnFocus}
                onChange={(e) => setWaist(e.target.value)}
                disabled={isPending}
                className="h-11 font-mono tabular-nums"
              />
            </div>
          </div>
        )}
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
