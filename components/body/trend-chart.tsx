'use client'

import * as React from 'react'
import { addDays, format, parseISO } from 'date-fns'
import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
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

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  buildBodyFatTrend,
  buildWeightTrend,
  summarizeWeightTrend,
  type TrendWindowDays,
  type WeightTrendSummary,
} from '@/lib/body/weight-trend'
import type { BodyMetric, Unit } from '@/lib/types'

// Design tokens (charts take literal colors, not tailwind classes).
const COLORS = {
  signal: '#c7f24a',
  muted: '#8a92a0',
  border: '#2c313a',
  surface: '#1e2228',
  yellow: '#e8c45a',
}

type RangePreset = '14d' | '30d' | '90d' | '180d' | '365d' | 'all' | 'custom'

const RANGE_OPTIONS: { value: RangePreset; label: string; days: number | null }[] = [
  { value: '14d', label: 'Last 2 weeks', days: 14 },
  { value: '30d', label: 'Last 30 days', days: 30 },
  { value: '90d', label: 'Last 90 days', days: 90 },
  { value: '180d', label: 'Last 6 months', days: 180 },
  { value: '365d', label: 'Last year', days: 365 },
  { value: 'all', label: 'All time', days: null },
  { value: 'custom', label: 'Custom range', days: null },
]

interface TrendChartProps {
  /** Ascending by measured_on. */
  entries: BodyMetric[]
  unit: Unit
}

interface Point {
  date: string
  label: string
  weight: number | null
  weightAverage: number | null
  bodyfat: number | null
  bodyfatAverage: number | null
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
        {payload.map((item) => (
          <div key={item.name} className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-muted">{item.name}</span>
            <span className="ml-auto font-mono tabular-nums text-foreground">
              {typeof item.value === 'number' ? item.value.toFixed(1) : '—'}
              <span className="ml-0.5 text-muted">
                {item.dataKey === 'bodyfat' || item.dataKey === 'bodyfatAverage'
                  ? '%'
                  : ` ${unit}`}
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
    .flatMap((point) => [point.bodyfat, point.bodyfatAverage])
    .filter((value): value is number => value != null)
  if (values.length === 0) return [1, 80]

  const min = Math.min(...values)
  const max = Math.max(...values)
  const spread = Math.max(1, max - min)
  const pad = Math.max(0.8, spread * 0.2)
  const low = Math.max(1, Math.floor((min - pad) * 2) / 2)
  const high = Math.min(80, Math.ceil((max + pad) * 2) / 2)

  return low === high ? [Math.max(1, low - 1), Math.min(80, high + 1)] : [low, high]
}

function rangeStartForPreset(preset: RangePreset, firstDate: string, lastDate: string) {
  const option = RANGE_OPTIONS.find((item) => item.value === preset)
  if (!option?.days) return firstDate
  const candidate = format(addDays(parseISO(lastDate), -(option.days - 1)), 'yyyy-MM-dd')
  return candidate > firstDate ? candidate : firstDate
}

function formatSigned(value: number | null, precision: number) {
  if (value == null) return '—'
  if (value === 0) return value.toFixed(precision)
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(precision)}`
}

function SummaryMetric({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-background/50 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 truncate font-mono text-sm font-medium tabular-nums text-foreground">
        {value}
      </p>
      {detail ? <p className="mt-0.5 truncate text-[10px] text-muted">{detail}</p> : null}
    </div>
  )
}

function TrendSummaryCard({
  summary,
  unit,
  weighInCount,
  rangeLabel,
  averageWindowDays,
}: {
  summary: WeightTrendSummary
  unit: Unit
  weighInCount: number
  rangeLabel: string
  averageWindowDays: TrendWindowDays
}) {
  const Icon =
    summary.direction === 'down'
      ? TrendingDown
      : summary.direction === 'up'
        ? TrendingUp
        : Minus
  const tone =
    summary.direction === 'down'
      ? 'border-gate-green/40 bg-gate-green/[0.04]'
      : summary.direction === 'up'
        ? 'border-gate-yellow/40 bg-gate-yellow/[0.04]'
        : ''
  const iconTone =
    summary.direction === 'down'
      ? 'text-gate-green'
      : summary.direction === 'up'
        ? 'text-gate-yellow'
        : 'text-muted'
  const directionLabel =
    summary.direction === 'down'
      ? 'Down'
      : summary.direction === 'up'
        ? 'Up'
        : summary.direction === 'flat'
          ? 'Stable'
          : 'Building baseline'

  return (
    <Card className={tone}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{averageWindowDays}-day weight trend</CardTitle>
            <CardDescription>{rangeLabel}</CardDescription>
          </div>
          <div
            className={`flex shrink-0 items-center gap-1.5 rounded-full border border-current/25 px-2.5 py-1 text-xs font-medium ${iconTone}`}
          >
            <Icon className="size-3.5" aria-hidden />
            {summary.percentChange == null
              ? directionLabel
              : `${directionLabel} ${Math.abs(summary.percentChange).toFixed(2)}%`}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary.currentAverage == null ? (
          <div className="rounded-md border border-dashed border-border bg-background/30 px-4 py-5">
            <p className="text-sm font-medium text-foreground">
              A full trend needs {averageWindowDays} days.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Keep logging weigh-ins. The average appears after the first complete{' '}
              {averageWindowDays}-calendar-day window.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                  {summary.currentAverage.toFixed(1)}
                  <span className="ml-1.5 text-base font-normal text-muted">{unit}</span>
                </p>
                <p className="mt-1 text-xs text-muted">
                  Current {averageWindowDays}-day average
                </p>
              </div>
              {summary.startAverage != null && summary.change != null ? (
                <p className="max-w-[15rem] text-right text-xs leading-relaxed text-muted">
                  From {summary.startAverage.toFixed(1)} to {summary.currentAverage.toFixed(1)} {unit}
                  {' '}across this range.
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <SummaryMetric
                label="Change"
                value={`${formatSigned(summary.change, 1)}${summary.change == null ? '' : ` ${unit}`}`}
              />
              <SummaryMetric
                label="Weekly pace"
                value={`${formatSigned(summary.weeklyRate, 2)}${summary.weeklyRate == null ? '' : ` ${unit}`}`}
                detail={summary.weeklyRate == null ? undefined : 'per week'}
              />
              <SummaryMetric label="Weigh-ins" value={String(weighInCount)} detail="in range" />
            </div>
            <p className="text-[11px] leading-relaxed text-muted">
              The current window uses {summary.currentSampleCount}{' '}
              {summary.currentSampleCount === 1 ? 'weigh-in' : 'weigh-ins'} from the last{' '}
              {averageWindowDays} calendar days.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function TrendChart({
  entries,
  unit,
}: TrendChartProps) {
  const [averageWindowDays, setAverageWindowDays] = React.useState<TrendWindowDays>(7)
  const rollingSeries = React.useMemo(
    () => buildWeightTrend(entries, averageWindowDays),
    [entries, averageWindowDays],
  )
  const entryDates = entries.map((entry) => entry.measured_on).sort()
  const firstDate = [rollingSeries[0]?.date, entryDates[0]].filter(Boolean).sort()[0] ?? ''
  const lastDate =
    [rollingSeries.at(-1)?.date, entryDates.at(-1)].filter(Boolean).sort().at(-1) ?? ''
  const [rangePreset, setRangePreset] = React.useState<RangePreset>('90d')
  const [customStart, setCustomStart] = React.useState(firstDate)
  const [customEnd, setCustomEnd] = React.useState(lastDate)
  const bodyFatRollingSeries = React.useMemo(
    () => buildBodyFatTrend(entries, averageWindowDays, lastDate),
    [entries, averageWindowDays, lastDate],
  )

  React.useEffect(() => {
    setCustomStart((current) => current || firstDate)
    setCustomEnd((current) => (!current || current < lastDate ? lastDate : current))
  }, [firstDate, lastDate])

  const rangeStart =
    rangePreset === 'custom'
      ? customStart || firstDate
      : rangeStartForPreset(rangePreset, firstDate, lastDate)
  const rangeEnd = rangePreset === 'custom' ? customEnd || lastDate : lastDate
  const rangeOption = RANGE_OPTIONS.find((item) => item.value === rangePreset)

  const data: Point[] = React.useMemo(
    () =>
      rollingSeries
        .filter((point) => point.date >= rangeStart && point.date <= rangeEnd)
        .map((point) => ({
          date: point.date,
          label: format(parseISO(point.date), 'MMM d'),
          weight: point.weight,
          weightAverage: point.average,
          bodyfat: null,
          bodyfatAverage: null,
        })),
    [rollingSeries, rangeStart, rangeEnd],
  )
  const bodyFatData: Point[] = React.useMemo(
    () =>
      bodyFatRollingSeries
        .filter((point) => point.date >= rangeStart && point.date <= rangeEnd)
        .map((point) => ({
          date: point.date,
          label: format(parseISO(point.date), 'MMM d'),
          weight: null,
          weightAverage: null,
          bodyfat: point.bodyfat,
          bodyfatAverage: point.average,
        })),
    [
      bodyFatRollingSeries,
      rangeStart,
      rangeEnd,
    ],
  )
  const summary = React.useMemo(
    () => summarizeWeightTrend(rollingSeries, rangeStart, rangeEnd),
    [rollingSeries, rangeStart, rangeEnd],
  )
  const weighInCount = entries.filter(
    (entry) =>
      entry.bodyweight != null && entry.measured_on >= rangeStart && entry.measured_on <= rangeEnd,
  ).length
  const hasBodyfat = bodyFatData.some((point) => point.bodyfat != null)
  const hasBodyfatAverage = bodyFatData.some((point) => point.bodyfatAverage != null)
  const bodyFatYAxisDomain = percentDomain(bodyFatData)
  const rangeLabel = `${format(parseISO(rangeStart), 'MMM d, yyyy')} – ${format(parseISO(rangeEnd), 'MMM d, yyyy')}`

  const axisProps = {
    stroke: COLORS.muted,
    tick: { fill: COLORS.muted, fontSize: 11 },
    tickLine: false,
    axisLine: { stroke: COLORS.border },
  } as const

  function changeCustomStart(value: string) {
    setCustomStart(value)
    if (value && customEnd && value > customEnd) setCustomEnd(value)
  }

  function changeCustomEnd(value: string) {
    setCustomEnd(value)
    if (value && customStart && value < customStart) setCustomStart(value)
  }

  return (
    <div className="space-y-4">
      <TrendSummaryCard
        summary={summary}
        unit={unit}
        weighInCount={weighInCount}
        rangeLabel={rangeLabel}
        averageWindowDays={averageWindowDays}
      />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle>Weight over time</CardTitle>
              <CardDescription>
                Calendar-day rolling averages for weight and body fat, with raw readings
                for context.
              </CardDescription>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted">Average window</span>
                <Tabs
                  value={String(averageWindowDays)}
                  onValueChange={(value) =>
                    setAverageWindowDays(Number(value) as TrendWindowDays)
                  }
                >
                  <TabsList
                    className="h-9"
                    aria-label="Weight and body fat rolling average window"
                  >
                    <TabsTrigger value="7" className="px-2.5 py-1 text-xs">
                      7d
                    </TabsTrigger>
                    <TabsTrigger value="14" className="px-2.5 py-1 text-xs">
                      14d
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <Select
                value={rangePreset}
                onValueChange={(value) => setRangePreset(value as RangePreset)}
              >
                <SelectTrigger
                  className="w-full sm:w-[10.5rem]"
                  aria-label="Weight and body fat trend date range"
                >
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
            </div>
          </div>
          {rangePreset === 'custom' ? (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="weight-range-start" className="text-xs text-muted">
                  From
                </Label>
                <Input
                  id="weight-range-start"
                  type="date"
                  value={customStart}
                  min={firstDate}
                  max={lastDate}
                  onChange={(event) => changeCustomStart(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="weight-range-end" className="text-xs text-muted">
                  To
                </Label>
                <Input
                  id="weight-range-end"
                  type="date"
                  value={customEnd}
                  min={firstDate}
                  max={lastDate}
                  onChange={(event) => changeCustomEnd(event.target.value)}
                />
              </div>
            </div>
          ) : null}
          <p className="text-[11px] text-muted">
            {rangeOption?.label} · {weighInCount} {weighInCount === 1 ? 'weigh-in' : 'weigh-ins'} · {rangeLabel}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-0 w-4 border-t-[3px]"
                style={{ borderColor: COLORS.signal }}
              />
              {averageWindowDays}-day average
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: COLORS.muted }}
              />
              Raw weigh-in
            </span>
          </div>

          <div
            className="h-60 w-full"
            aria-label={`Bodyweight and ${averageWindowDays}-day average trend chart`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" minTickGap={24} {...axisProps} />
                <YAxis domain={['auto', 'auto']} width={44} allowDecimals={false} {...axisProps} />
                <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ stroke: COLORS.border }} />
                <Line
                  type="monotone"
                  name="Raw weight"
                  dataKey="weight"
                  stroke={COLORS.muted}
                  strokeWidth={1.25}
                  strokeOpacity={0.7}
                  dot={{ r: 2, fill: COLORS.muted, strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                  connectNulls
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  name={`${averageWindowDays}-day average`}
                  dataKey="weightAverage"
                  stroke={COLORS.signal}
                  strokeWidth={2.75}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {hasBodyfat || hasBodyfatAverage ? (
            <div className="space-y-2 border-t border-border pt-4">
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
                {hasBodyfat ? (
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: COLORS.muted }}
                    />
                    Raw body fat
                  </span>
                ) : null}
                {hasBodyfatAverage ? (
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-0 w-4 border-t-[3px]"
                      style={{ borderColor: COLORS.yellow }}
                    />
                    {averageWindowDays}-day body fat avg
                  </span>
                ) : null}
              </div>
              <div className="h-40 w-full" aria-label="Body fat trend chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={bodyFatData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" minTickGap={24} {...axisProps} />
                    <YAxis
                      domain={bodyFatYAxisDomain}
                      width={44}
                      tickFormatter={(value) => `${value}%`}
                      {...axisProps}
                    />
                    <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ stroke: COLORS.border }} />
                    {hasBodyfat ? (
                      <Line
                        type="monotone"
                        name="Body fat"
                        dataKey="bodyfat"
                        stroke={COLORS.muted}
                        strokeWidth={1.25}
                        strokeOpacity={0.7}
                        dot={{ r: 2, fill: COLORS.muted, strokeWidth: 0 }}
                        activeDot={{ r: 4 }}
                        connectNulls
                        isAnimationActive={false}
                      />
                    ) : null}
                    {hasBodyfatAverage ? (
                      <Line
                        type="monotone"
                        name={`${averageWindowDays}-day body fat avg`}
                        dataKey="bodyfatAverage"
                        stroke={COLORS.yellow}
                        strokeWidth={2.75}
                        dot={false}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    ) : null}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
