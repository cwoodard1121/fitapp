'use client'

import * as React from 'react'
import { differenceInCalendarDays, parseISO } from 'date-fns'

import { Stat } from '@/components/ui/stat'
import type { BodyMetric, Unit } from '@/lib/types'

interface BodyStatsProps {
  /** Ascending by measured_on. */
  entries: BodyMetric[]
  unit: Unit
}

/** Weight change from the latest entry vs. the entry nearest `days` ago. */
function deltaOver(entries: BodyMetric[], days: number): number | null {
  if (entries.length < 2) return null
  const latest = entries[entries.length - 1]
  if (latest.bodyweight == null) return null
  const latestDate = parseISO(latest.measured_on)
  // Most recent prior entry that is at least `days` old.
  let ref: BodyMetric | null = null
  for (let i = entries.length - 2; i >= 0; i--) {
    const e = entries[i]
    if (e.bodyweight == null) continue
    if (differenceInCalendarDays(latestDate, parseISO(e.measured_on)) >= days) {
      ref = e
      break
    }
  }
  if (!ref || ref.bodyweight == null) return null
  return Math.round((latest.bodyweight - ref.bodyweight) * 10) / 10
}

function DeltaStat({
  label,
  delta,
  unit,
}: {
  label: string
  delta: number | null
  unit: string
}) {
  const tone = delta == null || delta === 0 ? 'muted' : 'default'
  const display =
    delta == null ? null : `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta)}`
  return (
    <Stat
      label={label}
      value={display}
      unit={delta == null ? undefined : unit}
      tone={tone}
      placeholder="—"
    />
  )
}

export function BodyStats({ entries, unit }: BodyStatsProps) {
  const latest = entries[entries.length - 1] ?? null
  const latestBf = [...entries].reverse().find((e) => e.bodyfat_pct != null)?.bodyfat_pct ?? null

  const d7 = deltaOver(entries, 7)
  const d30 = deltaOver(entries, 30)

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
      <Stat
        label="Current"
        value={latest?.bodyweight ?? null}
        unit={unit}
        size="lg"
        tone="signal"
        precision={1}
      />
      <Stat
        label="Body fat"
        value={latestBf}
        unit="%"
        size="lg"
        precision={1}
        placeholder="—"
      />
      <DeltaStat label="7-day change" delta={d7} unit={unit} />
      <DeltaStat label="30-day change" delta={d30} unit={unit} />
    </div>
  )
}
