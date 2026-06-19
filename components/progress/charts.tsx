"use client"

import * as React from "react"
import { format, parseISO } from "date-fns"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import type { ExercisePoint, VolumeWeekRow } from "./types"

/* ------------------------------------------------------------------ */
/* Dark "instrument panel" chart palette (recharts wants literal hex). */
/* ------------------------------------------------------------------ */

const SIGNAL = "#c7f24a"
const MUTED = "#8a92a0"
const GRID = "#2c313a"
const SURFACE = "#1e2228"
const TEXT = "#edeff2"

/** Quiet greys for the non-focused muscle areas in the volume chart. */
const MUTED_RAMP = ["#8a92a0", "#6b7280", "#525a66", "#3c424c", "#737b88"]

const axisTick = { fill: MUTED, fontSize: 11, fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }
const reduceMotion =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

function fmtDate(iso: string): string {
  try {
    return format(parseISO(iso), "MMM d")
  } catch {
    return iso.slice(5, 10)
  }
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

/* ------------------------------------------------------------------ */
/* Shared surfaced tooltip                                             */
/* ------------------------------------------------------------------ */

interface TipRow {
  label: string
  value: number | string
  color?: string
  unit?: string
}

function PanelTooltip({
  title,
  rows,
}: {
  title: string
  rows: TipRow[]
}) {
  return (
    <div
      className="rounded-md border border-border bg-surface px-3 py-2 shadow-md"
      style={{ background: SURFACE }}
    >
      <p className="mb-1 text-[11px] uppercase tracking-wider text-muted">{title}</p>
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2 text-xs">
            {r.color ? (
              <span
                aria-hidden
                className="inline-block size-2 rounded-[2px]"
                style={{ background: r.color }}
              />
            ) : null}
            <span className="text-muted">{r.label}</span>
            <span className="ml-auto font-mono tabular-nums text-foreground">
              {typeof r.value === "number" ? fmtNum(r.value) : r.value}
              {r.unit ? <span className="ml-0.5 text-muted">{r.unit}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Single-metric trend (e1RM / top-set load) over time                 */
/* ------------------------------------------------------------------ */

export function TrendChart({
  points,
  dataKey,
  unit,
  label,
}: {
  points: ExercisePoint[]
  dataKey: "e1rm" | "load"
  unit: string
  label: string
}) {
  const data = React.useMemo(
    () =>
      points
        .filter((p) => p[dataKey] != null)
        .map((p) => ({
          x: fmtDate(p.date),
          week: p.week,
          value: p[dataKey] as number,
        })),
    [points, dataKey]
  )

  if (data.length === 0) {
    return (
      <p className="flex h-[200px] items-center justify-center text-sm text-muted">
        No {label.toLowerCase()} logged yet.
      </p>
    )
  }

  const gradId = `grad-${dataKey}`

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SIGNAL} stopOpacity={0.25} />
            <stop offset="100%" stopColor={SIGNAL} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="x"
          tick={axisTick}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          minTickGap={16}
        />
        <YAxis
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          width={40}
          domain={["dataMin - 5", "dataMax + 5"]}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ stroke: MUTED, strokeWidth: 1, strokeDasharray: "3 3" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const p = payload[0].payload as { x: string; week: number; value: number }
            return (
              <PanelTooltip
                title={`${p.x} · week ${p.week}`}
                rows={[{ label, value: p.value, unit, color: SIGNAL }]}
              />
            )
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={SIGNAL}
          strokeWidth={2}
          fill={`url(#${gradId})`}
          dot={{ r: 2.5, fill: SIGNAL, stroke: SURFACE, strokeWidth: 1 }}
          activeDot={{ r: 4, fill: SIGNAL, stroke: SURFACE, strokeWidth: 1.5 }}
          isAnimationActive={!reduceMotion}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/* ------------------------------------------------------------------ */
/* Tonnage per muscle area per week (stacked bars)                     */
/* ------------------------------------------------------------------ */

export function VolumeChart({
  data,
  muscleAreas,
  focusMuscle,
  unit,
}: {
  data: VolumeWeekRow[]
  muscleAreas: string[]
  focusMuscle: string | null
  unit: string
}) {
  if (data.length === 0) {
    return (
      <p className="flex h-[220px] items-center justify-center text-sm text-muted">
        No tonnage logged yet.
      </p>
    )
  }

  // The focused exercise's muscle area gets the signal accent; the rest stay
  // quiet so the one accent keeps its meaning.
  const colorFor = (area: string, i: number) =>
    area === focusMuscle ? SIGNAL : MUTED_RAMP[i % MUTED_RAMP.length]

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="week"
          tickFormatter={(w) => `W${w}`}
          tick={axisTick}
          tickLine={false}
          axisLine={{ stroke: GRID }}
        />
        <YAxis
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          width={48}
          tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
        />
        <Tooltip
          cursor={{ fill: "rgba(138,146,160,0.08)" }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            const rows = payload
              .filter((p) => (p.value as number) > 0)
              .map((p) => ({
                label: String(p.name),
                value: p.value as number,
                unit,
                color: p.color,
              }))
            if (rows.length === 0) return null
            return <PanelTooltip title={`Week ${label}`} rows={rows} />
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, color: MUTED }}
          iconType="square"
          iconSize={8}
        />
        {muscleAreas.map((area, i) => (
          <Bar
            key={area}
            dataKey={area}
            stackId="vol"
            fill={colorFor(area, i)}
            radius={i === muscleAreas.length - 1 ? [3, 3, 0, 0] : undefined}
            isAnimationActive={!reduceMotion}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

export const chartColors = { SIGNAL, MUTED, GRID, SURFACE, TEXT }
