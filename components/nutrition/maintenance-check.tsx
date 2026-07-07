'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Gauge, ArrowDown, ArrowUp, Check, Minus, FlaskConical } from 'lucide-react'

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
  minCalories: number | null
}

/**
 * Compares calorie balance with scale movement over the active diet block.
 * This lives in Nutrition because it adjusts the maintenance calorie estimate.
 */
export function MaintenanceCheck({
  calibration,
  unit,
  currentMaintenance,
  stepBaseline,
  minCalories,
}: MaintenanceCheckProps) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const c = calibration
  const actualSub = c.scaleBasis === 'cut_floor' ? 'block floor' : 'from scale'
  const consistencyPct = Math.round(c.trackingConsistency * 100)

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
          Maintenance calibration
        </CardTitle>
        <CardDescription>
          Compares your recent reliable intake with scale movement inside the active block.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <RateTile
            label="Predicted"
            sub="from intake"
            weeklyLoss={c.predictedWeeklyLoss}
            unit={unit}
          />
          <RateTile
            label="Actual"
            sub={actualSub}
            weeklyLoss={c.actualWeeklyLoss}
            unit={unit}
          />
        </div>

        <div className="space-y-2">
          {minCalories != null ? (
            <Note tone="muted" icon={<FlaskConical className="size-4 shrink-0" aria-hidden />}>
              Calibration ignores completed intake days below {minCalories.toLocaleString()} kcal
              {c.ignoredLowDays > 0
                ? ` (${c.ignoredLowDays} dropped in the selected window).`
                : '.'}
            </Note>
          ) : null}
        </div>

        {c.status === 'insufficient' ? (
          <Note tone="muted" icon={<FlaskConical className="size-4 shrink-0" aria-hidden />}>
            A maintenance suggestion unlocks after about 2 weeks, 5 weigh-ins, 10 reliable intake
            days, and 70% recent consistency. So far: {c.bodyReadings} weigh-in
            {c.bodyReadings === 1 ? '' : 's'}, {c.daysLogged}/{c.intakeWindowDays} reliable days
            {c.intakeWindowDays > 0 ? ` (${consistencyPct}%)` : ''}.
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
                <strong>{c.suggestion.direction === 'lower' ? 'slower' : 'faster'}</strong> than
                your intake predicts. Your maintenance may be about{' '}
                <strong>{c.suggestion.kcal.toLocaleString()} kcal</strong> too{' '}
                {c.suggestion.direction === 'lower' ? 'high' : 'low'}
                {currentMaintenance != null ? (
                  <>
                    {' '}
                    - try <strong>{c.suggestion.newMaintenance.toLocaleString()}</strong> instead
                    of {currentMaintenance.toLocaleString()}.
                  </>
                ) : (
                  '.'
                )}
              </span>
            </p>
            <Button onClick={applySuggestion} disabled={pending} size="touch" className="sm:w-auto sm:px-5">
              <Check className="size-4" aria-hidden />
              {pending ? 'Saving...' : `Use ${c.suggestion.newMaintenance.toLocaleString()} kcal`}
            </Button>
          </div>
        ) : (
          <Note tone="green" icon={<Check className="size-4 shrink-0" aria-hidden />}>
            Intake and scale movement line up. Maintenance looks dialed in.
          </Note>
        )}
      </CardContent>
    </Card>
  )
}

function RateTile({
  label,
  sub,
  weeklyLoss,
  unit,
}: {
  label: string
  sub: string
  /** units/week, positive = losing. */
  weeklyLoss: number
  unit: string
}) {
  const losing = weeklyLoss > 0.005
  const gaining = weeklyLoss < -0.005
  const Arrow = losing ? ArrowDown : gaining ? ArrowUp : Minus
  const tone = losing ? 'text-signal' : gaining ? 'text-gate-yellow' : 'text-muted'
  const word = losing ? 'losing' : gaining ? 'gaining' : 'holding'
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <Arrow className={`size-5 shrink-0 self-center ${tone}`} aria-hidden />
        <span className="font-mono text-2xl font-semibold tabular-nums leading-none text-foreground">
          {Math.abs(weeklyLoss).toFixed(2)}
        </span>
        <span className="text-xs font-normal text-muted">{unit}/wk</span>
      </div>
      <div className="mt-1 text-[11px] text-muted">
        {word} - {sub}
      </div>
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
