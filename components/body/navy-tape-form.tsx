'use client'

import * as React from 'react'
import { useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { upsertNavyMeasurement } from '@/app/(app)/body/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { latestStoredHeightCm } from '@/lib/body/body-fat'
import type { BodyMetric, Unit } from '@/lib/types'

const CM_PER_INCH = 2.54

function displayMeasurement(valueCm: number | null, unit: Unit) {
  if (valueCm == null) return ''
  const value = unit === 'lb' ? valueCm / CM_PER_INCH : valueCm
  return String(Math.round(value * 10) / 10)
}

function measurementCm(value: number, unit: Unit) {
  return unit === 'lb' ? value * CM_PER_INCH : value
}

function selectOnFocus(event: React.FocusEvent<HTMLInputElement>) {
  event.currentTarget.select()
}

export function NavyTapeForm({
  entries,
  unit,
  measuredOn,
  onDone,
}: {
  entries: BodyMetric[]
  unit: Unit
  measuredOn: string
  onDone?: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const measurementUnit = unit === 'lb' ? 'in' : 'cm'
  const savedHeightCm = latestStoredHeightCm(entries)
  const [height, setHeight] = React.useState(
    displayMeasurement(savedHeightCm, unit),
  )
  const [neck, setNeck] = React.useState('')
  const [waist, setWaist] = React.useState('')
  const heightRef = React.useRef<HTMLInputElement>(null)
  const neckRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      const target = savedHeightCm == null ? heightRef.current : neckRef.current
      target?.focus()
      target?.select()
    }, 50)
    return () => window.clearTimeout(timer)
  }, [savedHeightCm])

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsedHeight = Number.parseFloat(height)
    const parsedNeck = Number.parseFloat(neck)
    const parsedWaist = Number.parseFloat(waist)
    if (
      !Number.isFinite(parsedHeight) ||
      !Number.isFinite(parsedNeck) ||
      !Number.isFinite(parsedWaist)
    ) {
      toast.error('Enter height, neck, and waist.')
      return
    }

    const heightCm = measurementCm(parsedHeight, unit)
    const neckCm = measurementCm(parsedNeck, unit)
    const waistCm = measurementCm(parsedWaist, unit)
    if (waistCm <= neckCm) {
      toast.error('Waist must be larger than neck for the Navy calculation.')
      return
    }

    startTransition(async () => {
      const result = await upsertNavyMeasurement({
        measured_on: measuredOn,
        height_cm: heightCm,
        neck_cm: neckCm,
        waist_cm: waistCm,
      })
      if (result.ok) {
        toast.success('Weekly measurements saved.')
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
        normal exhale. Height prefills after your first entry.
      </p>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="navy-height">Height ({measurementUnit})</Label>
          <Input
            id="navy-height"
            ref={heightRef}
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            required
            value={height}
            onFocus={selectOnFocus}
            onChange={(event) => setHeight(event.target.value)}
            disabled={isPending}
            className="h-12 font-mono tabular-nums"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="navy-neck">Neck ({measurementUnit})</Label>
          <Input
            id="navy-neck"
            ref={neckRef}
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            required
            value={neck}
            onFocus={selectOnFocus}
            onChange={(event) => setNeck(event.target.value)}
            disabled={isPending}
            className="h-12 font-mono tabular-nums"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="navy-waist">Waist ({measurementUnit})</Label>
          <Input
            id="navy-waist"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            required
            value={waist}
            onFocus={selectOnFocus}
            onChange={(event) => setWaist(event.target.value)}
            disabled={isPending}
            className="h-12 font-mono tabular-nums"
          />
        </div>
      </div>

      <Button type="submit" size="touch" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            Saving
          </>
        ) : (
          'Save weekly measurements'
        )}
      </Button>
    </form>
  )
}
