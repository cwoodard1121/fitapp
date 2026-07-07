"use client"

import { format, parseISO } from "date-fns"
import { Scale } from "lucide-react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Stat,
} from "@/components/ui"
import type { WeightBasis } from "@/lib/body/metrics"
import type { Unit } from "@/lib/types"

import type { BodyTrendPoint } from "./types"

// Design tokens (charts take literal colors, not tailwind classes).
const COLORS = {
  signal: "#c7f24a",
  muted: "#8a92a0",
  border: "#2c313a",
  surface: "#1e2228",
  yellow: "#e8c45a",
  blue: "#67d4ff",
  text: "#edeff2",
}

interface ChartRow {
  label: string
  weight: number | null
  bodyfat: number | null
  estimatedBodyfat: number | null
}

function firstLast(values: (number | null)[]): {
  first: number | null
  last: number | null
} {
  let first: number | null = null
  let last: number | null = null
  for (const v of values) {
    if (v == null) continue
    if (first == null) first = v
    last = v
  }
  return { first, last }
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
              {typeof p.value === "number" ? p.value : "—"}
              <span className="ml-0.5 text-muted">
                {p.dataKey === "bodyfat" || p.dataKey === "estimatedBodyfat" ? "%" : ` ${unit}`}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function percentDomain(points: ChartRow[]): [number, number] {
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

export function BodyTrend({
  points,
  unit,
  currentWeight,
  rawLatestWeight,
  weightBasis,
  weightChange,
  bodyFatBlockStartDate,
}: {
  points: BodyTrendPoint[]
  unit: Unit
  currentWeight: number | null
  rawLatestWeight: number | null
  weightBasis: WeightBasis
  weightChange: number | null
  bodyFatBlockStartDate: string | null
}) {
  if (points.length === 0) return null

  const data: ChartRow[] = points.map((p) => ({
    label: safeLabel(p.date),
    weight: p.bodyweight,
    bodyfat: p.bodyfat,
    estimatedBodyfat: p.estimatedBodyfat,
  }))
  const bodyFatPoints = bodyFatBlockStartDate
    ? points.filter((p) => p.date >= bodyFatBlockStartDate)
    : points
  const bodyFatData: ChartRow[] = bodyFatPoints.map((p) => ({
    label: safeLabel(p.date),
    weight: p.bodyweight,
    bodyfat: p.bodyfat,
    estimatedBodyfat: p.estimatedBodyfat,
  }))

  const hasBodyfat = bodyFatData.some((p) => p.bodyfat != null)
  const hasEstimatedBodyfat = bodyFatData.some((p) => p.estimatedBodyfat != null)

  const fat = firstLast(bodyFatData.map((p) => p.bodyfat))
  const bodyFatYAxisDomain = percentDomain(bodyFatData)

  const axisProps = {
    stroke: COLORS.muted,
    tick: { fill: COLORS.muted, fontSize: 11 },
    tickLine: false,
    axisLine: { stroke: COLORS.border },
  } as const

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Scale className="size-4 text-signal" aria-hidden />
          Bodyweight trend
        </CardTitle>
        <CardDescription>
          Bodyweight over your logged range
          {hasBodyfat || hasEstimatedBodyfat
            ? bodyFatBlockStartDate
              ? "; body fat over the active block."
              : "; body fat over your logged range."
            : "."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Stat
            label={weightBasis === "block_floor" ? "Scale floor" : "Latest"}
            value={currentWeight}
            unit={unit}
            precision={1}
            tone="signal"
          />
          <Stat
            label="Change"
            value={weightChange}
            unit={unit}
            precision={1}
            tone={
              weightChange == null || weightChange === 0
                ? "muted"
                : weightChange > 0
                  ? "yellow"
                  : "green"
            }
            placeholder="—"
          />
          {hasBodyfat ? (
            <Stat
              label="Body fat"
              value={fat.last}
              unit="%"
              precision={1}
            />
          ) : (
            <Stat label="Entries" value={points.length} />
          )}
        </div>
        {weightBasis === "block_floor" &&
        rawLatestWeight != null &&
        rawLatestWeight !== currentWeight ? (
          <p className="text-[11px] text-muted">
            Latest raw weigh-in: {rawLatestWeight.toFixed(1)} {unit}.
          </p>
        ) : null}

        <div className="h-52 w-full" aria-label="Bodyweight trend chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" minTickGap={24} {...axisProps} />
              <YAxis domain={["auto", "auto"]} width={44} allowDecimals={false} {...axisProps} />
              <Tooltip
                content={<ChartTooltip unit={unit} />}
                cursor={{ stroke: COLORS.border }}
              />
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
                  <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" vertical={false} />
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
      </CardContent>
    </Card>
  )
}

function safeLabel(iso: string): string {
  try {
    return format(parseISO(iso), "MMM d")
  } catch {
    return iso.slice(5, 10)
  }
}
