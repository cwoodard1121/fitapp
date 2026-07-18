'use client'

import * as React from 'react'
import { useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { upsertNavyMeasurement } from '@/app/(app)/body/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function selectOnFocus(event: React.FocusEvent<HTMLInputElement>) {
  event.currentTarget.select()
}

export function NavyTapeForm({
  heightCm,
  measuredOn,
  onDone,
}: {
  heightCm: number
  measuredOn: string
  onDone?: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [neck, setNeck] = React.useState('')
  const [waist, setWaist] = React.useState('')
  const neckRef = React.useRef<HTMLInputElement>(null)

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
        measured_on: measuredOn,
        neck_cm: parsedNeck,
        waist_cm: parsedWaist,
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
        normal exhale. Using your {heightCm} cm height from Settings.
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
