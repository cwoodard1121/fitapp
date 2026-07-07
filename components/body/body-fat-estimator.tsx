'use client'

import * as React from 'react'
import { useTransition } from 'react'
import { Dumbbell, Loader2, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  deleteBaselineLift,
  upsertBaselineLift,
} from '@/app/(app)/body/actions'
import {
  estimateBodyFatFromLeanRetention,
  type StrengthEstimatePoint,
  type StrengthLiftKind,
} from '@/lib/body/metrics'
import type { BaselineLift, Block, BodyMetric, Unit } from '@/lib/types'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Stat,
} from '@/components/ui'

type LiftKind = BaselineLift['lift_kind']

const LIFTS: { kind: LiftKind; label: string; defaultName: string }[] = [
  { kind: 'bench', label: 'Bench', defaultName: 'Barbell bench press' },
  { kind: 'squat', label: 'Squat', defaultName: 'Barbell back squat' },
  { kind: 'deadlift', label: 'Deadlift', defaultName: 'Conventional deadlift' },
  { kind: 'press', label: 'Press', defaultName: 'Overhead press' },
]

function liftLabel(kind: LiftKind) {
  return LIFTS.find((lift) => lift.kind === kind)?.label ?? kind
}

function defaultName(kind: LiftKind) {
  return LIFTS.find((lift) => lift.kind === kind)?.defaultName ?? ''
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`
}

function formatDate(date: string | null) {
  return date ? date.slice(0, 10) : 'No date'
}

export function BodyFatEstimator({
  entries,
  unit,
  activeDietBlock,
  strengthPoints,
  baselineLifts,
  suggestedBaselineLiftNames,
}: {
  entries: BodyMetric[]
  unit: Unit
  activeDietBlock: Pick<Block, 'start_date'> | null
  strengthPoints: StrengthEstimatePoint[]
  baselineLifts: BaselineLift[]
  suggestedBaselineLiftNames: Partial<Record<StrengthLiftKind, string>>
}) {
  const [isPending, startTransition] = useTransition()
  const [kind, setKind] = React.useState<LiftKind>('bench')
  const selectedLift = baselineLifts.find((lift) => lift.lift_kind === kind) ?? null
  const suggestedName = suggestedBaselineLiftNames[kind] ?? defaultName(kind)
  const [exerciseName, setExerciseName] = React.useState(suggestedName)
  const [e1rm, setE1rm] = React.useState('')
  const [liftedOn, setLiftedOn] = React.useState('')

  React.useEffect(() => {
    setExerciseName(selectedLift?.exercise_name ?? suggestedName)
    setE1rm(selectedLift?.e1rm != null ? String(selectedLift.e1rm) : '')
    setLiftedOn(selectedLift?.lifted_on ?? '')
  }, [kind, selectedLift, suggestedName])

  const blockStart = activeDietBlock?.start_date ?? null
  const estimate = React.useMemo(
    () =>
      blockStart
        ? estimateBodyFatFromLeanRetention(entries, { start_date: blockStart }, strengthPoints)
        : null,
    [entries, blockStart, strengthPoints],
  )
  const breakdown = estimate?.breakdown ?? null
  const strength = breakdown?.strengthSignal ?? null
  const strengthApplied =
    breakdown != null && strength != null && strength.bodyfat < breakdown.leanEstimate

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const parsedE1rm = Number.parseFloat(e1rm)
    if (!Number.isFinite(parsedE1rm) || parsedE1rm <= 0) {
      toast.error('Enter an estimated 1RM.')
      return
    }

    startTransition(async () => {
      const res = await upsertBaselineLift({
        lift_kind: kind,
        exercise_name: exerciseName.trim() || suggestedName,
        e1rm: parsedE1rm,
        lifted_on: liftedOn || null,
      })
      if (res.ok) toast.success('Baseline lift saved.')
      else toast.error(res.error)
    })
  }

  function onDelete(lift: BaselineLift) {
    startTransition(async () => {
      const res = await deleteBaselineLift(lift.id)
      if (res.ok) toast.success('Baseline lift removed.')
      else toast.error(res.error)
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Dumbbell className="size-4 text-signal" aria-hidden />
          Body-fat estimate
        </CardTitle>
        <CardDescription>Current estimate math and manual lift anchors.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {breakdown ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                label="Final"
                value={breakdown.finalEstimate}
                unit="%"
                precision={1}
                tone="signal"
              />
              <Stat label="Base" value={breakdown.leanEstimate} unit="%" precision={1} />
              <Stat
                label="Strength"
                value={strength?.bodyfat ?? null}
                unit="%"
                precision={1}
              />
              <Stat
                label="Blend"
                value={strengthApplied ? pct(strength.weight) : null}
                placeholder="none"
              />
            </div>

            <div className="grid gap-3 text-xs text-muted sm:grid-cols-2">
              <div className="rounded-md border border-border bg-background p-3">
                <p className="mb-2 font-medium uppercase tracking-wider text-muted">
                  Lean anchor
                </p>
                <dl className="space-y-1">
                  <div className="flex justify-between gap-3">
                    <dt>Anchor</dt>
                    <dd className="font-mono text-foreground">
                      {breakdown.baselineWeight.toFixed(1)} {unit} at{' '}
                      {breakdown.baselineBodyfat.toFixed(1)}%
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Dry water</dt>
                    <dd className="font-mono text-foreground">
                      {breakdown.dryWaterDrop.toFixed(1)} {unit}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Dry lean mass</dt>
                    <dd className="font-mono text-foreground">
                      {breakdown.dryLeanMass.toFixed(1)} {unit}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-md border border-border bg-background p-3">
                <p className="mb-2 font-medium uppercase tracking-wider text-muted">
                  Strength signal
                </p>
                {strength ? (
                  <div className="space-y-2">
                    {strength.lifts.map((lift) => (
                      <div
                        key={`${lift.kind}-${lift.source}-${lift.date}`}
                        className="flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-foreground">{lift.exerciseName}</p>
                          <p>
                            {lift.source === 'baseline' ? 'Baseline' : 'Logged'} -{' '}
                            {formatDate(lift.date)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right font-mono text-foreground">
                          <p>
                            {lift.e1rm.toFixed(1)} {unit}
                          </p>
                          <p className="text-muted">
                            {lift.ratio.toFixed(1)}x - {lift.signalBodyfat.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>No qualifying barbell lift signal in the estimate.</p>
                )}
              </div>
            </div>
          </>
        ) : (
          <p className="rounded-md border border-border bg-background p-3 text-sm text-muted">
            An active diet block, bodyweight entries, and one body-fat anchor are needed before
            the estimate can be broken down.
          </p>
        )}

        <div className="border-t border-border pt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-foreground">Baseline lifts</p>
              <p className="text-xs text-muted">
                Manual anchors apply when recent barbell logs are missing.
              </p>
            </div>
          </div>

          {baselineLifts.length > 0 ? (
            <div className="mb-4 space-y-2">
              {baselineLifts.map((lift) => (
                <div
                  key={lift.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {liftLabel(lift.lift_kind)} - {lift.exercise_name}
                    </p>
                    <p className="text-xs text-muted">{formatDate(lift.lifted_on)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-mono text-sm tabular-nums text-foreground">
                      {Number(lift.e1rm).toFixed(1)} {unit}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${liftLabel(lift.lift_kind)} baseline`}
                      disabled={isPending}
                      onClick={() => onDelete(lift)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[1fr_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="baseline-kind">Lift</Label>
              <Select value={kind} onValueChange={(value) => setKind(value as LiftKind)}>
                <SelectTrigger id="baseline-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LIFTS.map((lift) => (
                    <SelectItem key={lift.kind} value={lift.kind}>
                      {lift.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="baseline-e1rm">Estimated 1RM ({unit})</Label>
              <Input
                id="baseline-e1rm"
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0"
                value={e1rm}
                onChange={(e) => setE1rm(e.target.value)}
                disabled={isPending}
                className="font-mono tabular-nums"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="baseline-name">Exercise name</Label>
              <Input
                id="baseline-name"
                value={exerciseName}
                onChange={(e) => setExerciseName(e.target.value)}
                disabled={isPending}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="baseline-date">Date</Label>
              <Input
                id="baseline-date"
                type="date"
                value={liftedOn}
                onChange={(e) => setLiftedOn(e.target.value)}
                disabled={isPending}
              />
            </div>

            <Button type="submit" className="sm:col-span-2" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Saving
                </>
              ) : (
                <>
                  <Save aria-hidden />
                  Save baseline lift
                </>
              )}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  )
}
