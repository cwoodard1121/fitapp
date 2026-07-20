'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowDown,
  ArrowUp,
  AlertTriangle,
  Check,
  CheckCircle2,
  Circle,
  Gauge,
  Scale,
} from 'lucide-react'

import type { Calibration } from '@/lib/nutrition/calibration'
import type { Unit } from '@/lib/types'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Stat,
} from '@/components/ui'
import { setMaintenanceCalories } from '@/app/(app)/nutrition/actions'

export function MaintenanceCheck({
  calibration,
  unit,
  currentMaintenance,
}: {
  calibration: Calibration
  unit: Unit
  currentMaintenance: number | null
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const c = calibration

  function applyEstimate() {
    if (c.estimatedMaintenance == null) return
    startTransition(async () => {
      const res = await setMaintenanceCalories({
        maintenance_calories: c.estimatedMaintenance!,
        step_baseline: c.stepBaseline,
      })
      if (res.ok) {
        toast.success(
          `Maintenance set to ${c.estimatedMaintenance!.toLocaleString()} kcal at ${c.stepBaseline.toLocaleString()} steps.`,
        )
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
          Infers maintenance at exactly {c.stepBaseline.toLocaleString()} steps/day.
          An early estimate appears after 7 complete post-settling days and locks
          by day 14.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {c.checklist.map((item) => {
            const Icon = item.complete ? CheckCircle2 : Circle
            return (
              <div
                key={item.key}
                className="flex items-start gap-2 rounded-md border border-border bg-background p-3"
              >
                <Icon
                  className={
                    item.complete
                      ? 'mt-0.5 size-4 shrink-0 text-gate-green'
                      : 'mt-0.5 size-4 shrink-0 text-muted'
                  }
                  aria-hidden
                />
                <div>
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted">{item.detail}</p>
                </div>
              </div>
            )
          })}
        </div>

        {c.status === 'collecting' ? (
          <p className="rounded-md border border-border bg-background p-3 text-sm leading-snug text-muted">
            The first estimate appears after the 6-day water-settling period, 7
            complete calorie + step days, and a usable scale rate.
          </p>
        ) : null}

        {c.estimatedMaintenance != null ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                label={`${
                  c.status === 'provisional' ? 'Early maint' : 'Maint'
                } @ ${c.stepBaseline.toLocaleString()} steps`}
                value={c.estimatedMaintenance}
                unit="kcal"
                tone="signal"
              />
              <RateStat value={c.actualWeeklyLoss} unit={unit} />
              <Stat label="Avg intake" value={c.avgCalories} unit="kcal" />
              <Stat label="Avg steps" value={c.avgSteps} precision={0} />
            </div>

            {c.status === 'provisional' ? (
              <p className="flex items-start gap-2 rounded-md border border-gate-yellow/40 bg-gate-yellow/10 p-3 text-sm leading-snug text-foreground">
                <AlertTriangle
                  className="mt-0.5 size-4 shrink-0 text-gate-yellow"
                  aria-hidden
                />
                <span>
                  <strong>Early estimate only.</strong> It is based on{' '}
                  {c.analysisDays} post-settling days and {c.bodyReadings} weigh-ins.
                  Water noise can still move it; wait for the 14-day lock before
                  changing maintenance.
                </span>
              </p>
            ) : c.suggestion ? (
              <div className="space-y-3 rounded-md border border-gate-yellow/40 bg-gate-yellow/10 p-3">
                <p className="flex items-start gap-2 text-sm leading-snug text-foreground">
                  {c.suggestion.direction === 'lower' ? (
                    <ArrowDown className="mt-0.5 size-4 shrink-0 text-gate-yellow" aria-hidden />
                  ) : (
                    <ArrowUp className="mt-0.5 size-4 shrink-0 text-gate-yellow" aria-hidden />
                  )}
                  <span>
                    {currentMaintenance == null ? (
                      <>
                        The tracked intake, steps, and scale rate imply{' '}
                        <strong>{c.suggestion.newMaintenance.toLocaleString()} kcal</strong>.
                      </>
                    ) : (
                      <>
                        The current {currentMaintenance.toLocaleString()} kcal setting is about{' '}
                        <strong>{c.suggestion.kcal?.toLocaleString()} kcal</strong>{' '}
                        {c.suggestion.direction === 'lower' ? 'high' : 'low'} at the
                        fixed step baseline.
                      </>
                    )}
                  </span>
                </p>
                <Button
                  onClick={applyEstimate}
                  disabled={pending}
                  size="touch"
                  className="sm:w-auto sm:px-5"
                >
                  <Check className="size-4" aria-hidden />
                  {pending
                    ? 'Saving...'
                    : `Use ${c.suggestion.newMaintenance.toLocaleString()} kcal`}
                </Button>
              </div>
            ) : c.aligned ? (
              <p className="flex items-start gap-2 rounded-md border border-gate-green/40 bg-gate-green/10 p-3 text-sm leading-snug text-gate-green">
                <Check className="size-4 shrink-0" aria-hidden />
                Current maintenance is within 50 kcal of the inferred value at the
                fixed step baseline.
              </p>
            ) : null}

            <p className="text-xs leading-snug text-muted">
              The calculation adds observed tissue loss to intake, then removes
              calories attributable to steps above the baseline (or adds them back
              below it). The saved step baseline stays unchanged.
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}

function RateStat({
  value,
  unit,
}: {
  value: number | null
  unit: Unit
}) {
  const losing = (value ?? 0) > 0
  const Icon = losing ? ArrowDown : (value ?? 0) < 0 ? ArrowUp : Scale
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted">Scale rate</p>
      <div className="mt-1 flex items-center gap-1">
        <Icon className="size-4 text-signal" aria-hidden />
        <span className="font-mono text-xl font-semibold tabular-nums text-foreground">
          {value == null ? '—' : Math.abs(value).toFixed(2)}
        </span>
        <span className="text-xs text-muted">{unit}/wk</span>
      </div>
      <p className="mt-1 text-[11px] text-muted">
        {value == null ? 'collecting' : losing ? 'losing' : value < 0 ? 'gaining' : 'holding'}
      </p>
    </div>
  )
}
