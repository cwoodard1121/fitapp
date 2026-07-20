'use client'

import * as React from 'react'
import { Activity } from 'lucide-react'

import { estimateBodyFatFromLeanRetention } from '@/lib/body/metrics'
import {
  interpretBodyMetrics,
  latestBodyFatInterpretation,
} from '@/lib/body/body-fat'
import type { Block, BodyMetric, Unit } from '@/lib/types'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Stat,
} from '@/components/ui'

export function BodyFatEstimator({
  entries,
  unit,
  activeDietBlock,
}: {
  entries: BodyMetric[]
  unit: Unit
  activeDietBlock: Pick<Block, 'start_date'> | null
}) {
  const interpretedEntries = React.useMemo(
    () => interpretBodyMetrics(entries),
    [entries],
  )
  const interpretation = React.useMemo(
    () => latestBodyFatInterpretation(entries),
    [entries],
  )
  const estimate = React.useMemo(
    () =>
      activeDietBlock?.start_date
        ? estimateBodyFatFromLeanRetention(interpretedEntries, {
            start_date: activeDietBlock.start_date,
          })
        : null,
    [activeDietBlock, interpretedEntries],
  )
  const breakdown = estimate?.breakdown ?? null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Activity className="size-4 text-signal" aria-hidden />
          Body-fat method
        </CardTitle>
        <CardDescription>
          Weekly tape is the primary signal. Recent BIA smooths it, and each
          new measurement recalibrates the active-cut estimate.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Navy · 65%"
            value={interpretation?.navyBodyfatPct ?? null}
            unit="%"
            precision={1}
          />
          <Stat
            label="BIA · 35%"
            value={interpretation?.biaMedianPct ?? null}
            unit="%"
            precision={1}
          />
          <Stat
            label="Combined"
            value={interpretation?.bodyfatPct ?? null}
            unit="%"
            precision={1}
            tone="signal"
          />
          <Stat
            label="BIA samples"
            value={interpretation?.biaSampleCount ?? 0}
            size="sm"
          />
        </div>

        {breakdown ? (
          <div className="rounded-md border border-border bg-background p-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <Stat
                label="Cut-adjusted estimate"
                value={breakdown.finalEstimate}
                unit="%"
                precision={1}
                tone="signal"
              />
              <p className="max-w-sm text-xs leading-snug text-muted">
                Recalibrated to {breakdown.baselineBodyfat.toFixed(1)}% on{' '}
                {breakdown.baselineDate}, using {breakdown.baselineWeight.toFixed(1)}{' '}
                {unit}
                {breakdown.baselineWeightDate === breakdown.baselineDate
                  ? ''
                  : ` from ${breakdown.baselineWeightDate}`}
                . The water adjustment is limited to{' '}
                {breakdown.dryWaterDrop.toFixed(1)} {unit} of weight actually lost
                since that reading.
              </p>
            </div>
          </div>
        ) : (
          <p className="rounded-md border border-border bg-background p-3 text-sm text-muted">
            The cut-adjusted estimate appears after an active diet block has a
            recent bodyweight plus a BIA or Navy reading.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
