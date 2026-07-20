'use client'

import * as React from 'react'
import { endOfISOWeek, format, parseISO, startOfISOWeek } from 'date-fns'
import { useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { upsertNavyMeasurement } from '@/app/(app)/body/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { calculateNavyBodyFatPct } from '@/lib/body/body-fat'
import type { BodyMetric } from '@/lib/types'

function selectOnFocus(event: React.FocusEvent<HTMLInputElement>) {
  event.currentTarget.select()
}

export function NavyTapeForm({
  heightCm,
  measuredOn,
  initial,
  onDone,
}: {
  heightCm: number
  measuredOn: string
  initial?: BodyMetric | null
  onDone?: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [selectedDate, setSelectedDate] = React.useState(
    initial?.measured_on ?? measuredOn,
  )
  const [neck, setNeck] = React.useState(
    initial?.neck_cm == null ? '' : String(initial.neck_cm),
  )
  const [waist, setWaist] = React.useState(
    initial?.waist_cm == null ? '' : String(initial.waist_cm),
  )
  const neckRef = React.useRef<HTMLInputElement>(null)
  const weekStart = format(startOfISOWeek(parseISO(measuredOn)), 'yyyy-MM-dd')
  const weekEnd = format(endOfISOWeek(parseISO(measuredOn)), 'yyyy-MM-dd')
  const latestSelectableDate = measuredOn < weekEnd ? measuredOn : weekEnd
  const preview = React.useMemo(() => {
    const parsedNeck = Number.parseFloat(neck)
    const parsedWaist = Number.parseFloat(waist)
    if (!Number.isFinite(parsedNeck) || !Number.isFinite(parsedWaist)) return null
    return calculateNavyBodyFatPct({
      heightCm,
      neckCm: parsedNeck,
      waistCm: parsedWaist,
    })
  }, [heightCm, neck, waist])

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      neckRef.current?.focus()
      neckRef.current?.select()
    }, 50)
    return () => window.clearTimeout(timer)
  }, [])

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsedNeck = Number.parseFloat(neck)
    const parsedWaist = Number.parseFloat(waist)
    if (!Number.isFinite(parsedNeck) || !Number.isFinite(parsedWaist)) {
      toast.error('Enter neck and waist in centimeters.')
      return
    }

    if (parsedWaist <= parsedNeck) {
      toast.error('Waist must be larger than neck for the Navy calculation.')
      return
    }

    startTransition(async () => {
      const result = await upsertNavyMeasurement({
        measured_on: selectedDate,
        neck_cm: parsedNeck,
        waist_cm: parsedWaist,
      })
      if (result.ok) {
        toast.success(initial ? 'Navy reading updated.' : 'Navy reading added.')
        onDone?.()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-xs leading-relaxed text-muted">
        Measure neck just below the larynx and waist across the navel after a
        normal exhale. Using your {heightCm} cm height from Settings. You can
        save one reading per day; accepted readings are averaged for the week.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="navy-neck">Neck (cm)</Label>
          <Input
            id="navy-neck"
            ref={neckRef}
            type="number"
            inputMode="decimal"
            step="0.1"
            min="15"
            max="100"
            required
            value={neck}
            onFocus={selectOnFocus}
            onChange={(event) => setNeck(event.target.value)}
            disabled={isPending}
            className="h-12 font-mono tabular-nums"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="navy-waist">Waist (cm)</Label>
          <Input
            id="navy-waist"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="30"
            max="250"
            required
            value={waist}
            onFocus={selectOnFocus}
            onChange={(event) => setWaist(event.target.value)}
            disabled={isPending}
            className="h-12 font-mono tabular-nums"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="navy-date">Date</Label>
        <Input
          id="navy-date"
          type="date"
          min={initial ? initial.measured_on : weekStart}
          max={initial ? initial.measured_on : latestSelectableDate}
          value={selectedDate}
          onChange={(event) => setSelectedDate(event.target.value)}
          disabled={isPending || initial != null}
          className="h-12 font-mono tabular-nums"
        />
      </div>

      {preview != null ? (
        <p className="rounded-md border border-border bg-surface px-3 py-2 text-sm">
          Navy estimate:{' '}
          <span className="font-mono font-semibold tabular-nums text-signal">
            {preview.toFixed(1)}%
          </span>
        </p>
      ) : null}

      <Button type="submit" size="touch" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            Saving
          </>
        ) : (
          initial ? 'Save changes' : 'Add Navy reading'
        )}
      </Button>
    </form>
  )
}
