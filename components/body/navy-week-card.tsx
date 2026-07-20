'use client'

import { format, parseISO } from 'date-fns'
import { CheckCircle2, Pencil, Plus, Ruler, XCircle } from 'lucide-react'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { navyBodyFatSummaryInISOWeek } from '@/lib/body/body-fat'
import type { BodyMetric } from '@/lib/types'

export function NavyWeekCard({
  entries,
  heightCm,
  today,
  onAdd,
  onEdit,
}: {
  entries: BodyMetric[]
  heightCm: number | null
  today: string
  onAdd: () => void
  onEdit: (entry: BodyMetric) => void
}) {
  const summary = navyBodyFatSummaryInISOWeek(entries, today)
  const entryById = new Map(entries.map((entry) => [entry.id, entry]))

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Ruler className="size-4 text-signal" aria-hidden />
            This week&apos;s Navy readings
          </CardTitle>
          <CardDescription>
            Readings within 20% of their regular BIA reference are averaged.
            Larger deviations stay visible but do not affect the estimate.
          </CardDescription>
        </div>
        {heightCm == null ? (
          <Button asChild size="sm" className="shrink-0">
            <Link href="/settings">Set height</Link>
          </Button>
        ) : (
          <Button type="button" size="sm" className="shrink-0" onClick={onAdd}>
            <Plus aria-hidden />
            Add reading
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {summary ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border border-border bg-background p-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
                  Weekly average
                </p>
                <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-signal">
                  {summary.bodyfatPct == null
                    ? '—'
                    : `${summary.bodyfatPct.toFixed(1)}%`}
                </p>
              </div>
              <div className="rounded-md border border-border bg-background p-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
                  Included
                </p>
                <p className="mt-1 font-mono text-xl font-semibold tabular-nums">
                  {summary.acceptedSampleCount}/{summary.totalSampleCount}
                </p>
              </div>
            </div>

            <ul className="divide-y divide-border rounded-md border border-border">
              {summary.samples.map((sample) => {
                const entry = entryById.get(sample.id)
                if (!entry) return null
                return (
                  <li
                    key={sample.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5"
                  >
                    {sample.accepted ? (
                      <CheckCircle2
                        className="size-4 shrink-0 text-signal"
                        aria-label="Included"
                      />
                    ) : (
                      <XCircle
                        className="size-4 shrink-0 text-gate-red"
                        aria-label="Excluded"
                      />
                    )}
                    <span className="w-20 font-mono text-xs tabular-nums text-muted">
                      {format(parseISO(sample.measuredOn), 'EEE, MMM d')}
                    </span>
                    <span className="font-mono text-sm tabular-nums">
                      {sample.bodyfatPct.toFixed(1)}%
                    </span>
                    <span className="text-xs text-muted">
                      {entry.neck_cm?.toFixed(1)} / {entry.waist_cm?.toFixed(1)} cm
                    </span>
                    {sample.referenceBodyfatPct != null ? (
                      <span className="text-xs text-muted">
                        vs {sample.referenceBodyfatPct.toFixed(1)}% BIA
                      </span>
                    ) : null}
                    {!sample.accepted ? (
                      <Badge variant="destructive" className="text-[10px]">
                        Excluded
                      </Badge>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-8"
                      onClick={() => onEdit(entry)}
                    >
                      <Pencil className="size-3.5" aria-hidden />
                      Edit
                    </Button>
                  </li>
                )
              })}
            </ul>

            {summary.excludedSampleCount > 0 ? (
              <p className="text-xs text-muted">
                {summary.excludedSampleCount}{' '}
                {summary.excludedSampleCount === 1 ? 'reading is' : 'readings are'} more
                than 20% from the non-Navy BIA reference and excluded from this
                week&apos;s average.
              </p>
            ) : null}
          </>
        ) : (
          <div className="rounded-md border border-dashed border-border px-4 py-6 text-center">
            <p className="text-sm font-medium">No Navy readings this week</p>
            <p className="mt-1 text-xs text-muted">
              Add readings on different days and the accepted estimates will be
              averaged automatically.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
