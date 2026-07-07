"use client"

import * as React from "react"
import { format, parseISO } from "date-fns"
import { AlertTriangle, LineChart, Activity } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Stat,
  DecisionBadge,
  Badge,
} from "@/components/ui"

import { TrendChart, VolumeChart } from "./charts"
import { GoalsProgress } from "./goals-progress"
import { BodyTrend } from "./body-trend"
import type { ProgressData, ExerciseSeries } from "./types"

export function ProgressView({ data }: { data: ProgressData }) {
  const {
    exercises,
    volume,
    muscleAreas,
    unit,
    defaultExercise,
    goals,
    body,
    bodyWeightCurrent,
    bodyWeightRawLatest,
    bodyWeightBasis,
    bodyWeightChange,
  } = data

  const [selected, setSelected] = React.useState<string>(
    defaultExercise ?? exercises[0]?.name ?? ""
  )

  const current: ExerciseSeries | undefined = React.useMemo(
    () => exercises.find((e) => e.name === selected) ?? exercises[0],
    [exercises, selected]
  )

  return (
    <div className="space-y-4">
      {/* Lift charts — only when there is at least one logged lift. */}
      {current ? (
        <>
      {/* Exercise picker — focus every chart on one lift. */}
      <div className="space-y-1.5">
        <label
          htmlFor="exercise-picker"
          className="text-[11px] font-medium uppercase tracking-wider text-muted"
        >
          Focus exercise
        </label>
        <Select value={current.name} onValueChange={setSelected}>
          <SelectTrigger id="exercise-picker" className="h-12 w-full sm:max-w-sm">
            <SelectValue placeholder="Pick a lift" />
          </SelectTrigger>
          <SelectContent>
            {exercises.map((e) => (
              <SelectItem key={e.name} value={e.name}>
                <span className="flex w-full items-center justify-between gap-3">
                  <span>{e.name}</span>
                  <span className="font-mono tabular-nums text-xs text-muted">
                    {e.logCount}×
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary readout for the focused lift. */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <CardTitle className="text-base">{current.name}</CardTitle>
            {current.muscleArea ? (
              <Badge variant="outline" className="font-mono text-[11px] uppercase tracking-wide">
                {current.muscleArea}
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat
              label="Latest e1RM"
              value={current.latestE1rm}
              unit={unit}
              precision={1}
              tone="signal"
            />
            <Stat
              label="Best e1RM"
              value={current.bestE1rm}
              unit={unit}
              precision={1}
            />
            <Stat
              label="Top set"
              value={current.latestLoad}
              unit={unit}
            />
          </div>

          {current.stalled ? (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-md border border-gate-yellow/40 bg-gate-yellow/10 p-3"
            >
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-gate-yellow"
                aria-hidden
              />
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-gate-yellow">
                  Stalled — consider a swap or early deload
                </p>
                <p className="text-xs leading-snug text-muted">
                  {current.stallReason}
                </p>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* e1RM trend. */}
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="flex items-center gap-2 text-sm">
            <LineChart className="size-4 text-signal" aria-hidden />
            Estimated 1RM trend
          </CardTitle>
          <CardDescription>Epley e1RM from your best set each session.</CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <TrendChart points={current.points} dataKey="e1rm" unit={unit} label="e1RM" />
        </CardContent>
      </Card>

      {/* Top-set load trend. */}
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Activity className="size-4 text-signal" aria-hidden />
            Top-set load
          </CardTitle>
          <CardDescription>The working load you logged over time.</CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <TrendChart points={current.points} dataKey="load" unit={unit} label="Load" />
        </CardContent>
      </Card>

      {/* Decision history strip for the focused lift. */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Decision history</CardTitle>
          <CardDescription>What the engine called, session by session.</CardDescription>
        </CardHeader>
        <CardContent>
          <DecisionStrip series={current} />
        </CardContent>
      </Card>

      {/* Tonnage per muscle area per week. */}
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-sm">Weekly volume by muscle area</CardTitle>
          <CardDescription>
            Tonnage (sets × reps × load) each week.{" "}
            {current.muscleArea ? (
              <span className="text-signal">{current.muscleArea}</span>
            ) : null}{" "}
            {current.muscleArea ? "is highlighted." : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <VolumeChart
            data={volume}
            muscleAreas={muscleAreas}
            focusMuscle={current.muscleArea}
            unit={unit}
          />
        </CardContent>
      </Card>
        </>
      ) : null}

      {/* Goal progress — hidden when the user has no goals. */}
      <GoalsProgress goals={goals} />

      {/* Bodyweight + body-fat trend — hidden when no measurements logged. */}
      <BodyTrend
        points={body}
        unit={unit}
        currentWeight={bodyWeightCurrent}
        rawLatestWeight={bodyWeightRawLatest}
        weightBasis={bodyWeightBasis}
        weightChange={bodyWeightChange}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Decision history strip — the sequence of engine calls.              */
/* ------------------------------------------------------------------ */

function DecisionStrip({ series }: { series: ExerciseSeries }) {
  // Newest last; show oldest -> newest so the trend reads left to right.
  const points = series.points
  if (points.length === 0) {
    return <p className="text-sm text-muted">No decisions yet.</p>
  }

  return (
    <ol className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
      {points.map((p, i) => (
        <li
          key={`${p.date}-${i}`}
          className="flex min-w-[88px] shrink-0 flex-col items-start gap-1.5"
        >
          <span className="font-mono text-[11px] tabular-nums text-muted">
            W{p.week} · {safeDate(p.date)}
          </span>
          <DecisionBadge decision={p.decision} label={p.decisionLabel} size="sm" />
          {p.e1rm != null ? (
            <span className="font-mono text-[11px] tabular-nums text-muted">
              {p.e1rm.toFixed(1)} e1RM
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  )
}

function safeDate(iso: string): string {
  try {
    return format(parseISO(iso), "MMM d")
  } catch {
    return iso.slice(5, 10)
  }
}

/* ------------------------------------------------------------------ */
/* Empty state                                                         */
/* ------------------------------------------------------------------ */

export function ProgressEmpty({ reason }: { reason: "no-program" | "no-logs" }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex size-11 items-center justify-center rounded-md border border-border bg-background text-signal">
          <LineChart className="size-5" aria-hidden />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-medium">No progress to chart yet</h2>
          <p className="mx-auto max-w-xs text-sm text-muted">
            {reason === "no-program"
              ? "Set up a program first, then log a few sessions to see your e1RM, load, and volume trends here."
              : "Log a session on Today and your e1RM, top-set load, and weekly volume will plot here automatically."}
          </p>
        </div>
        <a
          href={reason === "no-program" ? "/program" : "/today"}
          className="inline-flex h-11 items-center justify-center rounded-md bg-signal px-4 text-sm font-semibold text-signal-foreground transition-opacity hover:opacity-90"
        >
          {reason === "no-program" ? "Set up program" : "Go to Today"}
        </a>
      </CardContent>
    </Card>
  )
}
