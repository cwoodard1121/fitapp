'use client'

import * as React from 'react'
import {
  format,
  parseISO,
  getISOWeek,
  getISOWeekYear,
  startOfISOWeek,
} from 'date-fns'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts'

import type { RecoveryMetric } from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// Charts take literal colors, not tailwind classes.
const COLORS = {
  signal: '#c7f24a',
  blue: '#6aa3e8',
  muted: '#8a92a0',
  border: '#2c313a',
  surface: '#1e2228',
}

type View = 'daily' | 'weekly'
type Range = '30d' | '90d' | '365d' | 'all'

const RANGE_OPTIONS: { value: Range; label: string; rows: number | null }[] = [
  { value: '30d', label: 'Last 30 days', rows: 30 },
  { value: '90d', label: 'Last 90 days', rows: 90 },
  { value: '365d', label: 'Last year', rows: 365 },
  { value: 'all', label: 'All imported', rows: null },
]

interface Bucket {
  key: string
  label: string
  steps: number | null
  sleepH: number | null
}

function buildDaily(rows: RecoveryMetric[]): Bucket[] {
  return rows.map((r) => ({
    key: r.metric_date,
    label: safeLabel(r.metric_date, 'M/d'),
    steps: r.steps,
    sleepH:
      r.sleep_minutes_asleep != null
        ? Math.round((r.sleep_minutes_asleep / 60) * 10) / 10
        : null,
  }))
}

/** Group by ISO week; steps + sleep shown as per-day AVERAGE for a comparable scale. */
function buildWeekly(rows: RecoveryMetric[]): Bucket[] {
  const groups = new Map<string, { label: string; steps: number[]; sleep: number[] }>()
  for (const r of rows) {
    let d: Date
    try {
      d = parseISO(r.metric_date)
    } catch {
      continue
    }
    const key = `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, '0')}`
    const g = groups.get(key) ?? {
      label: format(startOfISOWeek(d), 'MMM d'),
      steps: [],
      sleep: [],
    }
    if (r.steps != null) g.steps.push(r.steps)
    if (r.sleep_minutes_asleep != null) g.sleep.push(r.sleep_minutes_asleep)
    groups.set(key, g)
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, g]) => ({
      key,
      label: g.label,
      steps: g.steps.length ? Math.round(avg(g.steps)) : null,
      sleepH: g.sleep.length ? Math.round((avg(g.sleep) / 60) * 10) / 10 : null,
    }))
}

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function safeLabel(date: string, fmt: string): string {
  try {
    return format(parseISO(date), fmt)
  } catch {
    return date
  }
}

export function RecoveryCharts({ rows }: { rows: RecoveryMetric[] }) {
  const [view, setView] = React.useState<View>('daily')
  const [range, setRange] = React.useState<Range>('30d')
  const rangeRows = React.useMemo(() => {
    const count = RANGE_OPTIONS.find((option) => option.value === range)?.rows
    return count == null ? rows : rows.slice(-count)
  }, [range, rows])
  const data = React.useMemo(
    () => (view === 'daily' ? buildDaily(rangeRows) : buildWeekly(rangeRows)),
    [rangeRows, view],
  )

  const stepsVals = rangeRows.map((r) => r.steps).filter((v): v is number => v != null)
  const sleepVals = rangeRows
    .map((r) => r.sleep_minutes_asleep)
    .filter((v): v is number => v != null)
  const avgSteps = stepsVals.length ? Math.round(avg(stepsVals)) : null
  // Round to whole minutes ONCE, then split — avoids "7h 60m" from independent
  // floor/round on a fractional average.
  const avgSleepMin = sleepVals.length ? Math.round(avg(sleepVals)) : null
  const avgSleepLabel =
    avgSleepMin != null ? `${Math.floor(avgSleepMin / 60)}h ${avgSleepMin % 60}m` : '—'

  const axisProps = {
    stroke: COLORS.muted,
    tick: { fill: COLORS.muted, fontSize: 11 },
    tickLine: false,
    axisLine: { stroke: COLORS.border },
  } as const

  const perLabel = view === 'weekly' ? '/day avg' : ''

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-4">
          <Summary label="Avg steps" value={avgSteps != null ? avgSteps.toLocaleString() : '—'} />
          <Summary label="Avg sleep" value={avgSleepLabel} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={range} onValueChange={(value) => setRange(value as Range)}>
            <SelectTrigger className="h-9 w-[9.75rem]" aria-label="Recovery chart range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {RANGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Toggle view={view} onChange={setView} />
        </div>
      </div>

      <ChartBlock title={`Steps${perLabel ? ` (${perLabel})` : ''}`} color={COLORS.signal}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" minTickGap={16} {...axisProps} />
          <YAxis width={44} allowDecimals={false} {...axisProps} />
          <Tooltip content={<ChartTooltip unit="steps" />} cursor={{ fill: COLORS.border, opacity: 0.3 }} />
          <Bar dataKey="steps" name="Steps" fill={COLORS.signal} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ChartBlock>

      <ChartBlock title={`Sleep${perLabel ? ` (${perLabel})` : ''}`} color={COLORS.blue}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" minTickGap={16} {...axisProps} />
          <YAxis width={44} {...axisProps} unit="h" />
          <Tooltip content={<ChartTooltip unit="h" />} cursor={{ fill: COLORS.border, opacity: 0.3 }} />
          <Bar dataKey="sleepH" name="Sleep" fill={COLORS.blue} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ChartBlock>
    </div>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wider text-muted">{label}</span>
      <span className="font-mono text-lg font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  )
}

function Toggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div className="inline-flex shrink-0 rounded-md border border-border p-0.5">
      {(['daily', 'weekly'] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            'rounded px-3.5 py-1.5 text-xs font-medium capitalize transition-colors',
            view === v ? 'bg-signal text-signal-foreground' : 'text-muted hover:text-foreground',
          )}
        >
          {v}
        </button>
      ))}
    </div>
  )
}

function ChartBlock({
  title,
  color,
  children,
}: {
  title: string
  color: string
  children: React.ReactElement
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <span className="inline-block h-2 w-4 rounded-full" style={{ backgroundColor: color }} />
        {title}
      </div>
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: TooltipProps<number, string> & { unit: string }) {
  if (!active || !payload?.length) return null
  const v = payload[0]?.value
  const shown =
    typeof v === 'number'
      ? unit === 'steps'
        ? v.toLocaleString()
        : `${v} ${unit}`
      : '—'
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-0.5 font-medium text-foreground">{label}</div>
      <div className="font-mono tabular-nums text-foreground">{shown}</div>
    </div>
  )
}
