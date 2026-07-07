'use client'

import * as React from 'react'
import { format, parseISO } from 'date-fns'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  estimateBodyFatFromLeanRetention,
  type StrengthEstimatePoint,
} from '@/lib/body/metrics'
import type { Block, BodyMetric, Unit } from '@/lib/types'

// Design tokens (charts take literal colors, not tailwind classes).
const COLORS = {
  signal: '#c7f24a',
  muted: '#8a92a0',
  border: '#2c313a',
  surface: '#1e2228',
  yellow: '#e8c45a',
  blue: '#67d4ff',
  text: '#edeff2',
}

interface TrendChartProps {
  /** Ascending by measured_on. */
  entries: BodyMetric[]
  unit: Unit
  activeDietBlock: Pick<Block, 'start_date'> | null
  strengthPoints: StrengthEstimatePoint[]
}

interface Point {
  date: string
  label: string
  weight: number | null
  ma7: number | null
  bodyfat: number | null
  estimatedBodyfat: number | null
}

/** Trailing N-point simple moving average over a numeric series. */
function movingAverage(values: (number | null)[], window: number): (number | null)[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1).filter(
      (v): v is number => v != null,
    )
    if (slice.length === 0) return null
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length
    return Math.round(avg * 10) / 10
  })
}

function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: TooltipProps<number, string> & { unit: Unit }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-foreground">{label}</div>
      <div className="space-y-0.5">
        {payload.map((p) => (
          <div key={p.name} className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            <span className="text-muted">{p.name}</span>
            <span className="ml-auto font-mono tabular-nums text-foreground">
              {typeof p.value === 'number' ? p.value : '—'}
              <span className="ml-0.5 text-muted">
                {p.dataKey === 'bodyfat' || p.dataKey === 'estimatedBodyfat' ? '%' : ` ${unit}`}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function percentDomain(points: Point[]): [number, number] {
  const values = points
    .flatMap((p) => [p.bodyfat, p.estimatedBodyfat])
    .filter((v): v is number => v != null)
  if (values.length === 0) return [1, 80]

  const min = Math.min(...values)
  const max = Math.max(...values)
  const spread = Math.max(1, max - min)
  const pad = Math.max(0.8, spread * 0.2)
  const low = Math.max(1, Math.floor((min - pad) * 2) / 2)
  const high = Math.min(80, Math.ceil((max + pad) * 2) / 2)

  return low === high ? [Math.max(1, low - 1), Math.min(80, high + 1)] : [low, high]
}

export function TrendChart({ entries, unit, activeDietBlock, strengthPoints }: TrendChartProps) {
  const [showMa, setShowMa] = React.useState(true)
  const blockStart = activeDietBlock?.start_date ?? null

  const estimatedBodyfatPoints = React.useMemo(
    () =>
      blockStart
        ? estimateBodyFatFromLeanRetention(entries, { start_date: blockStart }, strengthPoints)
            .points
        : [],
    [entries, blockStart, strengthPoints],
  )
  const estimateByDate = React.useMemo(
    () => new Map(estimatedBodyfatPoints.map((p) => [p.date, p.bodyfat])),
    [estimatedBodyfatPoints],
  )

  const data: Point[] = React.useMemo(() => {
    const weights = entries.map((e) => e.bodyweight)
    const ma = movingAverage(weights, 7)
    return entries.map((e, i) => ({
      date: e.measured_on,
      label: format(parseISO(e.measured_on), 'MMM d'),
      weight: e.bodyweight,
      ma7: ma[i],
      bodyfat: e.bodyfat_pct,
      estimatedBodyfat: estimateByDate.get(e.measured_on) ?? null,
    }))
  }, [entries, estimateByDate])

  const bodyFatData = React.useMemo(
    () => (blockStart ? data.filter((p) => p.date >= blockStart) : data),
    [data, blockStart],
  )
  const hasBodyfat = bodyFatData.some((p) => p.bodyfat != null)
  const hasEstimatedBodyfat = bodyFatData.some((p) => p.estimatedBodyfat != null)
  const bodyFatYAxisDomain = percentDomain(bodyFatData)

  const axisProps = {
    stroke: COLORS.muted,
    tick: { fill: COLORS.muted, fontSize: 11 },
    tickLine: false,
    axisLine: { stroke: COLORS.border },
  } as const

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-4 rounded-full"
              style={{ backgroundColor: COLORS.signal }}
            />
            Weight
          </span>
          {showMa ? (
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-0 w-4 border-t-2 border-dashed"
                style={{ borderColor: COLORS.muted }}
              />
              7-day avg
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="ma-toggle"
            checked={showMa}
            onCheckedChange={setShowMa}
            aria-label="Toggle 7-day moving average"
          />
          <Label htmlFor="ma-toggle" className="cursor-pointer text-xs text-muted">
            7-day avg
          </Label>
        </div>
      </div>

      <div className="h-56 w-full" aria-label="Bodyweight trend chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" minTickGap={24} {...axisProps} />
            <YAxis
              domain={['auto', 'auto']}
              width={44}
              allowDecimals={false}
              {...axisProps}
            />
            <Tooltip
              content={<ChartTooltip unit={unit} />}
              cursor={{ stroke: COLORS.border }}
            />
            {showMa ? (
              <Line
                type="monotone"
                name="7-day avg"
                dataKey="ma7"
                stroke={COLORS.muted}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ) : null}
            <Line
              type="monotone"
              name="Weight"
              dataKey="weight"
              stroke={COLORS.signal}
              strokeWidth={2}
              dot={{ r: 2, fill: COLORS.signal, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {hasBodyfat || hasEstimatedBodyfat ? (
        <div className="space-y-2 border-t border-border pt-4">
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
            {hasBodyfat ? (
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-4 rounded-full"
                  style={{ backgroundColor: COLORS.yellow }}
                />
                Body fat %
              </span>
            ) : null}
            {hasEstimatedBodyfat ? (
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-0 w-4 border-t-2 border-dashed"
                  style={{ borderColor: COLORS.blue }}
                />
                Est. body fat
              </span>
            ) : null}
          </div>
          <div className="h-40 w-full" aria-label="Body fat trend chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={bodyFatData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid
                  stroke={COLORS.border}
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis dataKey="label" minTickGap={24} {...axisProps} />
                <YAxis
                  domain={bodyFatYAxisDomain}
                  width={44}
                  tickFormatter={(value) => `${value}%`}
                  {...axisProps}
                />
                <Tooltip
                  content={<ChartTooltip unit={unit} />}
                  cursor={{ stroke: COLORS.border }}
                />
                {hasBodyfat ? (
                  <Line
                    type="monotone"
                    name="Body fat"
                    dataKey="bodyfat"
                    stroke={COLORS.yellow}
                    strokeWidth={2}
                    dot={{ r: 2, fill: COLORS.yellow, strokeWidth: 0 }}
                    activeDot={{ r: 4 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                ) : null}
                {hasEstimatedBodyfat ? (
                  <Line
                    type="monotone"
                    name="Est. body fat"
                    dataKey="estimatedBodyfat"
                    stroke={COLORS.blue}
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={{ r: 1.5, fill: COLORS.blue, strokeWidth: 0 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                ) : null}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}
    </div>
  )
}
