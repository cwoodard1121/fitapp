'use client'

import * as React from 'react'
import { eachDayOfInterval, subDays, parseISO, format } from 'date-fns'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'

import type { NutritionLog } from '@/lib/types'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui'

// Design tokens (charts need concrete values, not tailwind classes).
const COLORS = {
  signal: '#c7f24a',
  grid: '#2c313a',
  muted: '#8a92a0',
  maintenance: '#e8c45a',
  surface: '#1e2228',
  border: '#2c313a',
  text: '#edeff2',
}

interface CaloriesTrendProps {
  logs: NutritionLog[]
  today: string
  calorieTarget: number | null
  maintenance: number | null
}

interface Point {
  date: string
  label: string
  calories: number | null
}

function buildSeries(
  logs: NutritionLog[],
  today: string,
  days: number
): Point[] {
  const byDate = new Map<string, number | null>()
  for (const l of logs) byDate.set(l.logged_on, l.calories)

  const end = parseISO(today)
  const start = subDays(end, days - 1)
  return eachDayOfInterval({ start, end }).map((d) => {
    const iso = format(d, 'yyyy-MM-dd')
    return {
      date: iso,
      label: format(d, 'M/d'),
      calories: byDate.has(iso) ? (byDate.get(iso) ?? null) : null,
    }
  })
}

function fmtDelta(n: number): string {
  return `${n > 0 ? '+' : ''}${n.toLocaleString()}`
}

function ChartTooltip({
  active,
  payload,
  target,
  maintenance,
}: {
  active?: boolean
  payload?: Array<{ payload: Point }>
  target: number | null
  maintenance: number | null
}) {
  if (!active || !payload || payload.length === 0) return null
  const p = payload[0].payload
  const kcal = p.calories
  const sameGuide =
    target !== null &&
    maintenance !== null &&
    Math.round(target) === Math.round(maintenance)
  const targetDelta =
    kcal !== null && target !== null ? Math.round(kcal - target) : null
  const maintDelta =
    kcal !== null && maintenance !== null && !sameGuide
      ? Math.round(kcal - maintenance)
      : null
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium text-foreground">
        {format(parseISO(p.date), 'EEE, MMM d')}
      </div>
      <div className="font-mono tabular-nums text-foreground">
        {kcal === null ? 'not logged' : `${Math.round(kcal)} kcal`}
      </div>
      {targetDelta !== null ? (
        <div
          className={
            targetDelta > 0
              ? 'font-mono tabular-nums text-gate-red'
              : 'font-mono tabular-nums text-gate-green'
          }
        >
          {fmtDelta(targetDelta)} vs {sameGuide ? 'target/maint' : 'target'}
        </div>
      ) : null}
      {maintDelta !== null ? (
        <div className="font-mono tabular-nums text-gate-yellow">
          {fmtDelta(maintDelta)} vs maint
        </div>
      ) : null}
    </div>
  )
}

export function CaloriesTrend({
  logs,
  today,
  calorieTarget,
  maintenance,
}: CaloriesTrendProps) {
  const [range, setRange] = React.useState<'7' | '14'>('7')
  const days = range === '7' ? 7 : 14

  const data = React.useMemo(
    () => buildSeries(logs, today, days),
    [logs, today, days]
  )

  const hasAny = data.some((d) => d.calories !== null)

  // Y domain: pad around logged values plus guide lines.
  const values = data
    .map((d) => d.calories)
    .filter((v): v is number => v !== null)
  if (calorieTarget !== null) values.push(calorieTarget)
  if (maintenance !== null) values.push(maintenance)
  const max = values.length ? Math.max(...values) : 2500
  const min = values.length ? Math.min(...values) : 0
  const yMax = Math.ceil((max * 1.1) / 100) * 100
  const yMin = Math.max(0, Math.floor((min * 0.9) / 100) * 100)
  const sameGuide =
    calorieTarget !== null &&
    maintenance !== null &&
    Math.round(calorieTarget) === Math.round(maintenance)
  const targetLabel =
    calorieTarget !== null
      ? `${sameGuide ? 'target/maint' : 'target'} ${Math.round(calorieTarget)}`
      : ''

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Calories trend</CardTitle>
          <CardDescription>
            {calorieTarget !== null && maintenance !== null
              ? 'Daily calories against your block target and maintenance.'
              : calorieTarget !== null
                ? 'Daily calories against your block target.'
                : maintenance !== null
                  ? 'Daily calories against your estimated maintenance.'
                  : 'Daily calories. Set a diet block or maintenance for guide lines.'}
          </CardDescription>
        </div>
        <Tabs value={range} onValueChange={(v) => setRange(v as '7' | '14')}>
          <TabsList>
            <TabsTrigger value="7">7d</TabsTrigger>
            <TabsTrigger value="14">14d</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {!hasAny ? (
          <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-border bg-background/40">
            <p className="px-6 text-center text-sm text-muted">
              No calories logged in the last {days} days yet. Log a day to start
              the trend.
            </p>
          </div>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data}
                margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={COLORS.grid}
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  stroke={COLORS.muted}
                  tick={{ fill: COLORS.muted, fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: COLORS.border }}
                  interval="preserveStartEnd"
                  minTickGap={16}
                />
                <YAxis
                  domain={[yMin, yMax]}
                  stroke={COLORS.muted}
                  tick={{ fill: COLORS.muted, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                />
                <Tooltip
                  cursor={{ stroke: COLORS.border }}
                  content={
                    <ChartTooltip
                      target={calorieTarget}
                      maintenance={maintenance}
                    />
                  }
                />
                {calorieTarget !== null ? (
                  <ReferenceLine
                    y={calorieTarget}
                    stroke={COLORS.muted}
                    strokeDasharray="4 4"
                    label={{
                      value: targetLabel,
                      position: 'insideTopRight',
                      fill: COLORS.muted,
                      fontSize: 10,
                    }}
                  />
                ) : null}
                {maintenance !== null && !sameGuide ? (
                  <ReferenceLine
                    y={maintenance}
                    stroke={COLORS.maintenance}
                    strokeDasharray="2 4"
                    label={{
                      value: `maint ${Math.round(maintenance)}`,
                      position: 'insideBottomRight',
                      fill: COLORS.maintenance,
                      fontSize: 10,
                    }}
                  />
                ) : null}
                <Line
                  type="monotone"
                  dataKey="calories"
                  stroke={COLORS.signal}
                  strokeWidth={2}
                  dot={{ r: 3, fill: COLORS.signal, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
