'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Gauge, ArrowDown, ArrowUp, Check, TrendingDown, FlaskConical } from 'lucide-react'

import type { Calibration } from '@/lib/nutrition/calibration'
import type { Unit } from '@/lib/types'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui'
import { setMaintenanceCalories } from '@/app/(app)/nutrition/actions'

interface MaintenanceCheckProps {
  calibration: Calibration
  unit: Unit
  currentMaintenance: number | null
  stepBaseline: number
}

/** Weekly weight change (negative = losing); signed, 2dp, with a true minus sign. */
function fmtChange(weeklyLoss: number): string {
  const change = -weeklyLoss // loss -> weight goes down -> negative
  const r = Math.round(change * 100) / 100
  if (Math.abs(r) < 0.005) return '0.00'
  return `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(2)}`
}

/**
 * MaintenanceCheck — sits under the weight-trend chart on Body. Compares the
 * loss the calorie deficit PREDICTS with the loss the scale ACTUALLY shows over
 * the diet block, and (with enough history) nudges the maintenance estimate when
 * the two rates persistently diverge. One-tap apply.
 */
export function MaintenanceCheck({
  calibration,
  unit,
  currentMaintenance,
  stepBaseline,
}: MaintenanceCheckProps) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const c = calibration

  function applySuggestion() {
    if (!c.suggestion) return
    startTransition(async () => {
      const res = await setMaintenanceCalories({
        maintenance_calories: c.suggestion!.newMaintenance,
        step_baseline: stepBaseline,
      })
      if (res.ok) {
        toast.success(`Maintenance set to ${c.suggestion!.newMaintenance.toLocaleString()} kcal.`)
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="size-4 text-signal" aria-hidden />
          Maintenance check
        </CardTitle>
        <CardDescription>
          What your deficit predicts vs. what the scale actually shows — water weight and
          all. If they drift apart over time, your maintenance is probably off.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Predicted vs actual — the two rates, side by side. */}
        <div className="grid grid-cols-2 gap-3">
          <RateTile
            label="Predicted"
            sub="from your intake"
            value={fmtChange(c.predictedWeeklyLoss)}
            unit={`${unit}/wk`}
          />
          <RateTile
            label="Actual"
            sub="from the scale"
            value={fmtChange(c.actualWeeklyLoss)}
            unit={`${unit}/wk`}
          />
        </div>

        {c.status === 'insufficient' ? (
          <Note tone="muted" icon={<FlaskConical className="size-4 shrink-0" aria-hidden />}>
            Calibrating — give it ~3 weeks of weigh-ins and logged intake for a reliable read.
            So far: {c.bodyReadings} weigh-in{c.bodyReadings === 1 ? '' : 's'}, {c.daysLogged} day
            {c.daysLogged === 1 ? '' : 's'} logged.
          </Note>
        ) : c.suggestion ? (
          <div className="space-y-3 rounded-md border border-gate-yellow/40 bg-gate-yellow/10 p-3">
            <p className="flex items-start gap-2 text-sm leading-snug text-foreground">
              {c.suggestion.direction === 'lower' ? (
                <ArrowDown className="mt-0.5 size-4 shrink-0 text-gate-yellow" aria-hidden />
              ) : (
                <ArrowUp className="mt-0.5 size-4 shrink-0 text-gate-yellow" aria-hidden />
              )}
              <span>
                The scale is moving{' '}
                <strong>{c.suggestion.direction === 'lower' ? 'slower' : 'faster'}</strong> than your
                intake predicts. Your maintenance may be ~
                <strong>{c.suggestion.kcal.toLocaleString()} kcal</strong> too{' '}
                {c.suggestion.direction === 'lower' ? 'high' : 'low'}
                {currentMaintenance != null ? (
                  <>
                    {' '}
                    — try{' '}
                    <strong>{c.suggestion.newMaintenance.toLocaleString()}</strong> instead of{' '}
                    {currentMaintenance.toLocaleString()}.
                  </>
                ) : (
                  '.'
                )}
              </span>
            </p>
            <Button onClick={applySuggestion} disabled={pending} size="touch" className="sm:w-auto sm:px-5">
              <Check className="size-4" aria-hidden />
              {pending ? 'Saving…' : `Use ${c.suggestion.newMaintenance.toLocaleString()} kcal`}
            </Button>
          </div>
        ) : (
          <Note tone="green" icon={<Check className="size-4 shrink-0" aria-hidden />}>
            Your intake and the scale line up — maintenance looks dialed in.
          </Note>
        )}
      </CardContent>
    </Card>
  )
}

function RateTile({
  label,
  sub,
  value,
  unit,
}: {
  label: string
  sub: string
  value: string
  unit: string
}) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted">
        <TrendingDown className="size-3 text-signal" aria-hidden />
        {label}
      </div>
      <div className="mt-1 font-mono text-2xl font-semibold tabular-nums leading-none text-foreground">
        {value}
        <span className="ml-1 text-xs font-normal text-muted">{unit}</span>
      </div>
      <div className="mt-1 text-[11px] text-muted">{sub}</div>
    </div>
  )
}

function Note({
  tone,
  icon,
  children,
}: {
  tone: 'muted' | 'green'
  icon: React.ReactNode
  children: React.ReactNode
}) {
  const toneClass =
    tone === 'green'
      ? 'border-gate-green/40 bg-gate-green/10 text-gate-green'
      : 'border-border bg-background text-muted'
  return (
    <p className={`flex items-start gap-2 rounded-md border p-3 text-sm leading-snug ${toneClass}`}>
      {icon}
      <span>{children}</span>
    </p>
  )
}
