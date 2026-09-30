"use client"

import {
  Activity,
  ArrowRight,
  BarChart3,
  ChevronDown,
  Dumbbell,
  Footprints,
  Salad,
} from "lucide-react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts"

import type { Block, Unit } from "@/lib/types"
import type { BlockStats } from "@/lib/blocks/stats"
import { Button } from "@/components/ui/button"
import { DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { formatRange } from "@/components/blocks/utils"
import {
  WRAPPED_COLORS as COLORS,
  WrappedDetailMetric as DetailMetric,
  WrappedStoryMetric as StoryMetric,
  wrappedGrouped as grouped,
  wrappedShortDate as shortDate,
  wrappedSigned as signed,
  wrappedValue as value,
} from "@/components/ui/wrapped-recap"

function WrappedTooltip({
  active,
  payload,
  label,
  unit,
}: TooltipProps<number, string> & { unit: Unit }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border bg-[#181b20] px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium text-foreground">
        {typeof label === "string" ? shortDate(label) : label}
      </p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex min-w-32 items-center gap-2">
          <span
            className="size-1.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted">{entry.name}</span>
          <span className="ml-auto font-mono text-foreground">
            {typeof entry.value === "number" ? entry.value.toFixed(1) : "—"}
            {entry.dataKey === "bodyfat" ? "%" : ` ${unit}`}
          </span>
        </div>
      ))}
    </div>
  )
}

export function BlockWrappedRecap({
  block,
  stats,
  unit,
  onDone,
}: {
  block: Block
  stats: BlockStats
  unit: Unit
  onDone: () => void
}) {
  const { training, nutrition, activity, body } = stats
  const hasWeightChange = body.startWeight != null || body.endWeight != null
  const hasBodyfatChange = body.startBodyfat != null || body.endBodyfat != null
  const hasTrend = body.trend.length > 1
  const detailMetrics = [
    ["Training days", grouped(training.trainingDays)],
    ["Exercises trained", grouped(training.exerciseCount)],
    ["Working sets", grouped(training.workingSets)],
    ["Total reps", grouped(training.totalReps)],
    ["Average set RIR", value(training.avgRir)],
    ["Days with steps", grouped(activity.daysLogged)],
    ["Average steps", activity.avgSteps == null ? "—" : grouped(activity.avgSteps)],
    ["Step baseline hit", activity.baselineHitPct == null ? "—" : `${Math.round(activity.baselineHitPct)}%`],
    ["Nutrition days", grouped(nutrition.daysLogged)],
    ["Average calories", nutrition.avgCalories == null ? "—" : grouped(nutrition.avgCalories)],
    ["Longest log streak", `${nutrition.longestLoggingStreak} days`],
    ["Body check-ins", grouped(body.checkIns)],
  ] as const

  return (
    <div className="overflow-hidden rounded-[inherit] bg-[#111318]">
      <div className="relative overflow-hidden border-b border-border px-5 pb-6 pt-7 sm:px-8 sm:pb-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60 [background:radial-gradient(circle_at_75%_10%,rgba(199,242,74,0.12),transparent_34%),linear-gradient(135deg,transparent_58%,rgba(199,242,74,0.04)_58%,rgba(199,242,74,0.04)_61%,transparent_61%)]"
        />
        <div className="relative max-w-3xl">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-signal">
            Block complete
          </p>
          <DialogTitle className="mt-2 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            {block.name}
          </DialogTitle>
          <DialogDescription className="mt-1 font-mono text-xs tabular-nums sm:text-sm">
            {formatRange(block)}
          </DialogDescription>

          <h2 className="mt-8 max-w-3xl text-4xl font-semibold leading-[0.98] tracking-[-0.045em] text-foreground sm:mt-10 sm:text-6xl">
            {stats.observedWeeks} {stats.observedWeeks === 1 ? "week" : "weeks"}.
            <br />
            You showed up.
          </h2>

          {hasWeightChange || hasBodyfatChange ? (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 sm:gap-0">
              {hasWeightChange ? (
                <div className="sm:border-r sm:border-border sm:pr-6">
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                    Weight
                  </p>
                  <div className="mt-2 flex items-center gap-2 font-mono text-3xl font-semibold tabular-nums tracking-tight text-foreground sm:text-4xl">
                    <span>{value(body.startWeight)}</span>
                    <ArrowRight className="size-6 text-signal" aria-hidden />
                    <span>{value(body.endWeight)}</span>
                    <span className="self-end pb-1 text-sm font-normal text-muted">
                      {unit}
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-sm text-signal">
                    {signed(body.weightChange, unit)}
                  </p>
                </div>
              ) : null}
              {hasBodyfatChange ? (
                <div className="sm:pl-6">
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                    Interpreted body fat
                  </p>
                  <div className="mt-2 flex items-center gap-2 font-mono text-3xl font-semibold tabular-nums tracking-tight text-foreground sm:text-4xl">
                    <span>{value(body.startBodyfat)}</span>
                    <ArrowRight className="size-6 text-signal" aria-hidden />
                    <span>{value(body.endBodyfat)}</span>
                    <span className="self-end pb-1 text-sm font-normal text-muted">
                      %
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-sm text-signal">
                    {signed(body.bodyfatChange, "pts")}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.35fr_0.95fr]">
        <div className="space-y-6 border-b border-border p-5 sm:p-8 lg:border-b-0 lg:border-r">
          {hasTrend ? (
            <section aria-labelledby="block-change-title">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h3 id="block-change-title" className="text-sm font-semibold">
                    Change across the block
                  </h3>
                  <p className="mt-0.5 text-xs text-muted">
                    Weight and interpreted body fat inside this block’s dates.
                  </p>
                </div>
                <span className="hidden font-mono text-[10px] uppercase tracking-wider text-signal sm:inline">
                  Block duration
                </span>
              </div>
              <div className="mt-4 h-56 w-full" aria-label="Block body progress chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={body.trend} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                    <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" vertical={false} />
                    <ReferenceArea
                      x1={body.trend[0]?.date}
                      x2={body.trend.at(-1)?.date}
                      fill={COLORS.signal}
                      fillOpacity={0.055}
                      strokeOpacity={0}
                    />
                    <XAxis
                      dataKey="date"
                      minTickGap={28}
                      tickFormatter={shortDate}
                      stroke={COLORS.muted}
                      tick={{ fill: COLORS.muted, fontSize: 10 }}
                      tickLine={false}
                      axisLine={{ stroke: COLORS.border }}
                    />
                    <YAxis
                      yAxisId="weight"
                      domain={["auto", "auto"]}
                      width={42}
                      tick={{ fill: COLORS.muted, fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      yAxisId="bodyfat"
                      orientation="right"
                      domain={["auto", "auto"]}
                      width={38}
                      tickFormatter={(tick) => `${tick}%`}
                      tick={{ fill: COLORS.muted, fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<WrappedTooltip unit={unit} />} />
                    <Line
                      yAxisId="weight"
                      type="monotone"
                      dataKey="weight"
                      name="Weight"
                      stroke={COLORS.signal}
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4 }}
                      connectNulls
                      isAnimationActive
                      animationDuration={700}
                    />
                    <Line
                      yAxisId="bodyfat"
                      type="monotone"
                      dataKey="bodyfat"
                      name="Body fat"
                      stroke={COLORS.bodyfat}
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      dot={false}
                      activeDot={{ r: 4 }}
                      connectNulls
                      isAnimationActive
                      animationDuration={800}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          ) : (
            <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-border text-center">
              <div className="max-w-xs px-5">
                <Activity className="mx-auto size-5 text-signal" aria-hidden />
                <p className="mt-2 text-sm font-medium">The work is recorded</p>
                <p className="mt-1 text-xs text-muted">
                  Add at least two body check-ins next block to unlock the transformation chart.
                </p>
              </div>
            </div>
          )}

          <details className="group rounded-lg border border-border bg-surface/35">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-medium marker:hidden">
              <BarChart3 className="size-4 text-signal" aria-hidden />
              View all stats
              <ChevronDown className="ml-auto size-4 text-muted transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="grid grid-cols-2 gap-x-3 gap-y-5 border-t border-border px-4 py-5 sm:grid-cols-3">
              {detailMetrics.map(([label, display]) => (
                <DetailMetric key={label} label={label} display={display} />
              ))}
            </div>
          </details>
        </div>

        <div className="divide-y divide-border">
          <section className="relative overflow-hidden px-5 py-7 sm:px-7">
            <div aria-hidden className="absolute inset-y-0 left-0 w-1 bg-signal" />
            <div className="flex items-center gap-2 text-signal">
              <Dumbbell className="size-4" aria-hidden />
              <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.16em]">
                Training
              </h3>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-5">
              <StoryMetric label="sessions" display={grouped(training.sessions)} />
              <StoryMetric label={`${unit} moved`} display={grouped(training.totalVolume)} />
            </div>
          </section>

          <section className="relative overflow-hidden px-5 py-7 sm:px-7">
            <div aria-hidden className="absolute inset-y-0 left-0 w-1 bg-muted" />
            <div className="flex items-center gap-2 text-signal">
              <Salad className="size-4" aria-hidden />
              <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.16em]">
                Nutrition
              </h3>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-5">
              <StoryMetric
                label="days logged"
                display={nutrition.coveragePct == null ? "—" : `${Math.round(nutrition.coveragePct)}%`}
              />
              <StoryMetric
                label="avg protein"
                display={nutrition.avgProtein == null ? "—" : `${Math.round(nutrition.avgProtein)} g`}
              />
            </div>
          </section>

          <section className="relative overflow-hidden px-5 py-7 sm:px-7">
            <div aria-hidden className="absolute inset-y-0 left-0 w-1 bg-signal" />
            <div className="flex items-center gap-2 text-signal">
              <Footprints className="size-4" aria-hidden />
              <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.16em]">
                Activity
              </h3>
            </div>
            <div className="mt-5">
              <StoryMetric label="total steps" display={grouped(activity.totalSteps)} />
            </div>
          </section>
        </div>
      </div>

      <footer className="flex flex-col gap-4 border-t border-border p-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p className="max-w-md text-sm leading-relaxed text-muted">
          Consistency built the change. Be proud of the work — then carry the lesson into what’s next.
        </p>
        <Button size="lg" className="w-full sm:w-auto sm:min-w-40" onClick={onDone}>
          Done
        </Button>
      </footer>
    </div>
  )
}
