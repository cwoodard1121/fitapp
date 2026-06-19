'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, RotateCcw, Minus, Plus } from 'lucide-react'

import { DEFAULT_WEIGHTS, type ReadinessWeights } from '@/lib/engine/engine'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Badge,
  Separator,
} from '@/components/ui'
import {
  updateReadinessWeights,
  resetReadinessWeights,
} from '@/app/(app)/settings/actions'

type WeightKey = keyof ReadinessWeights

const WEIGHT_META: Record<WeightKey, { label: string; hint: string }> = {
  recoveryGood: { label: 'Recovery good', hint: 'Felt recovered coming in' },
  recoveryBad: { label: 'Recovery bad', hint: 'Came in under-recovered' },
  perfUp: { label: 'Performance up', hint: 'Beat last session' },
  perfDown: { label: 'Performance down', hint: 'Fell short of last session' },
  pumpGood: { label: 'Pump good', hint: 'Strong working pump' },
  pumpBad: { label: 'Pump low', hint: 'Little to no pump' },
  enjoyment: { label: 'Enjoyment', hint: 'You liked the work' },
  sorenessBand: { label: 'Soreness in band', hint: 'Soreness sat in the sweet spot' },
  sorenessHighNoRecovery: {
    label: 'Sore, not recovered',
    hint: 'High soreness with poor recovery',
  },
  rirTooEasy: { label: 'RIR too easy', hint: 'Left more reps than targeted' },
  rirLow: { label: 'RIR too low', hint: 'Closer to failure than targeted' },
}

const ORDER = Object.keys(DEFAULT_WEIGHTS) as WeightKey[]
const MIN = -10
const MAX = 10
const STEP = 0.5

function fmt(n: number) {
  return (n > 0 ? '+' : '') + (Number.isInteger(n) ? String(n) : n.toFixed(1))
}

export function ReadinessWeightsForm({
  weights,
  isCustom,
}: {
  weights: ReadinessWeights
  isCustom: boolean
}) {
  const [values, setValues] = useState<ReadinessWeights>(weights)
  const [pending, startTransition] = useTransition()
  const [resetting, startReset] = useTransition()

  const dirty = useMemo(
    () => ORDER.some((k) => values[k] !== weights[k]),
    [values, weights]
  )

  function set(key: WeightKey, next: number) {
    const clamped = Math.min(MAX, Math.max(MIN, Math.round(next * 2) / 2))
    setValues((v) => ({ ...v, [key]: clamped }))
  }

  function onSave() {
    startTransition(async () => {
      const res = await updateReadinessWeights(values)
      if (res.ok) toast.success('Saved readiness weights.')
      else toast.error(res.error)
    })
  }

  function onReset() {
    startReset(async () => {
      const res = await resetReadinessWeights()
      if (res.ok) {
        setValues(DEFAULT_WEIGHTS)
        toast.success('Reset to default weights.')
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Readiness weights</CardTitle>
          {isCustom ? <Badge variant="outline">Custom</Badge> : null}
        </div>
        <CardDescription>
          These weight the growth score that drives every set&apos;s call.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-1">
        {ORDER.map((key, i) => {
          const meta = WEIGHT_META[key]
          const value = values[key]
          return (
            <div key={key}>
              {i > 0 ? <Separator className="my-1" /> : null}
              <div className="flex min-h-12 items-center justify-between gap-3 py-1">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {meta.label}
                  </p>
                  <p className="truncate text-xs text-muted">{meta.hint}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-9"
                    onClick={() => set(key, value - STEP)}
                    disabled={value <= MIN}
                    aria-label={`Decrease ${meta.label}`}
                  >
                    <Minus className="size-4" aria-hidden />
                  </Button>
                  <span className="w-12 text-center font-mono text-sm font-semibold tabular-nums text-foreground">
                    {fmt(value)}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-9"
                    onClick={() => set(key, value + STEP)}
                    disabled={value >= MAX}
                    aria-label={`Increase ${meta.label}`}
                  >
                    <Plus className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </CardContent>

      <CardFooter className="justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={onReset}
          disabled={resetting || pending}
        >
          {resetting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <RotateCcw className="size-4" aria-hidden />
          )}
          Reset to defaults
        </Button>
        <Button type="button" onClick={onSave} disabled={pending || !dirty}>
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Saving
            </>
          ) : (
            'Save weights'
          )}
        </Button>
      </CardFooter>
    </Card>
  )
}
