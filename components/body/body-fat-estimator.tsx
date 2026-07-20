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
          Weekly tape is the primary signal. Recent BIA smooths it without
          overriding the accepted tape trend.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
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
            label="BIA samples"
            value={interpretation?.biaSampleCount ?? 0}
            size="sm"
          />
        </div>

        {breakdown ? (
          <div className="rounded-md border border-border bg-background p-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <Stat
                label="Active-cut projection"
                value={breakdown.finalEstimate}
                unit="%"
                precision={1}
                tone="signal"
              />
              <p className="max-w-sm text-xs leading-snug text-muted">
                Anchored to {breakdown.baselineWeight.toFixed(1)} {unit} at{' '}
                {breakdown.baselineBodyfat.toFixed(1)}% on {breakdown.baselineDate}.
                A {breakdown.dryWaterDrop.toFixed(1)} {unit} dry-water allowance
                keeps early scale loss from being counted as fat.
              </p>
            </div>
          </div>
        ) : (
          <p className="rounded-md border border-border bg-background p-3 text-sm text-muted">
            The cut projection appears after an active diet block has a
            bodyweight and body-fat anchor.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
