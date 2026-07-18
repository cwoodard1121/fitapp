'use client'

import { Stat } from '@/components/ui/stat'
import {
  normalizedBodyweight,
  normalizedDeltaOver,
} from '@/lib/body/metrics'
import { latestBodyFatInterpretation } from '@/lib/body/body-fat'
import type { Block, BodyMetric, Unit } from '@/lib/types'

interface BodyStatsProps {
  /** Ascending by measured_on. */
  entries: BodyMetric[]
  unit: Unit
  activeDietBlock: Pick<Block, 'phase' | 'start_date'> | null
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

export function BodyStats({ entries, unit, activeDietBlock }: BodyStatsProps) {
  const normalized = normalizedBodyweight(entries, activeDietBlock)
  const latestBodyfat = latestBodyFatInterpretation(entries)?.bodyfatPct ?? null

  const d7 = normalizedDeltaOver(entries, 7, activeDietBlock)
  const d30 = normalizedDeltaOver(entries, 30, activeDietBlock)

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
      <Stat
        label={normalized.basis === 'block_floor' ? 'Scale floor' : 'Current'}
        value={normalized.value}
        unit={unit}
        size="lg"
        tone="signal"
        precision={1}
      />
      <Stat
        label="Body fat"
        value={latestBodyfat}
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
