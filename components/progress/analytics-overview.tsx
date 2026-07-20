import * as React from 'react'
import { format, parseISO } from 'date-fns'
import {
  Activity,
  CalendarClock,
  Flame,
  Scale,
  Target,
} from 'lucide-react'

import type { Unit } from '@/lib/types'
import type {
  GoalAnalytic,
  TrainingAnalytics,
} from '@/lib/analytics/types'
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Progress,
  Stat,
} from '@/components/ui'

/**
 * AnalyticsOverview — the deterministic numbers surface. Everything here is
 * computed in code (lib/analytics), NEVER by the LLM. It is the "analytics the
 * site uses" and renders something useful even in Week 1: mesocycle position,
 * goal pacing with required-vs-actual rate + projected ETA,
 * muscle volume balance, body trajectory, and nutrition adherence.
 */
export function AnalyticsOverview({
  analytics,
  unit,
}: {
  analytics: TrainingAnalytics
  unit: Unit
}) {
  const { meso, goals, body, volume, nutrition } = analytics

  return (
    <div className="space-y-4">
      <MesoCard meso={meso} />
      {goals.length > 0 ? <GoalsCard goals={goals} /> : null}
      {volume.length > 0 ? <VolumeCard volume={volume} unit={unit} /> : null}
      {body.readings > 0 ? <BodyCard body={body} unit={unit} /> : null}
      {nutrition.daysLogged > 0 ? <NutritionCard nutrition={nutrition} /> : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Mesocycle position                                                  */
/* ------------------------------------------------------------------ */

function MesoCard({ meso }: { meso: TrainingAnalytics['meso'] }) {
  const pct =
    meso.lengthWeeks > 0
      ? clamp((meso.week / meso.lengthWeeks) * 100, 0, 100)
      : 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4 text-signal" aria-hidden />
              Mesocycle
            </CardTitle>
            <CardDescription>{meso.programName}</CardDescription>
          </div>
          {meso.isDeloadThisWeek ? (
            <Badge variant="warning">Deload week</Badge>
          ) : (
            <Badge variant="muted">Deload W{meso.deloadWeek}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <Stat
            label="Week"
            value={`${meso.week} / ${meso.lengthWeeks}`}
            tone="signal"
          />
          <Stat label="Weeks left" value={meso.weeksLeft} />
          <Stat label="Deload week" value={meso.deloadWeek} />
        </div>
        <Progress value={pct} aria-label="Mesocycle progress" />
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Goal pacing                                                         */
/* ------------------------------------------------------------------ */

function GoalsCard({ goals }: { goals: GoalAnalytic[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Target className="size-4 text-signal" aria-hidden />
          Goal pacing
        </CardTitle>
        <CardDescription>
          Where each goal stands, how fast it must move, and where it lands.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-4">
          {goals.map((g) => (
            <GoalRow key={g.id} goal={g} />
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function GoalRow({ goal }: { goal: GoalAnalytic }) {
  const unit = goal.unit ?? ''
  return (
    <li className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{goal.title}</span>
        <GoalStatusBadge status={goal.status} />
      </div>

      <div className="flex items-center gap-3">
        <Progress
          value={goal.pctComplete != null ? clamp(goal.pctComplete, 0, 100) : 0}
          aria-label={`${goal.title} progress`}
          className="flex-1"
        />
        <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-muted">
          {goal.pctComplete != null ? `${num(goal.pctComplete)}%` : '—'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted sm:grid-cols-4">
        <Meta label="Current">
          {goal.current != null ? `${num(goal.current, 1)} ${unit}`.trim() : '—'}
        </Meta>
        <Meta label="Target">
          {goal.target != null ? `${num(goal.target, 1)} ${unit}`.trim() : '—'}
        </Meta>
        <Meta label="Need / wk">
          {goal.requiredWeeklyRate != null
            ? `${signed(goal.requiredWeeklyRate, 1)}`
            : '—'}
        </Meta>
        <Meta label="Actual / wk">
          {goal.actualWeeklyRate != null
            ? `${signed(goal.actualWeeklyRate, 1)}`
            : '—'}
        </Meta>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
        {goal.projectedEta ? (
          <span>
            Projected ETA{' '}
            <span className="text-foreground">{dateLabel(goal.projectedEta)}</span>
          </span>
        ) : null}
        {goal.targetDate ? (
          <span>
            Target{' '}
            <span className="text-foreground">{dateLabel(goal.targetDate)}</span>
            {goal.daysToTarget != null ? ` (${goal.daysToTarget}d)` : ''}
          </span>
        ) : null}
      </div>
    </li>
  )
}

/* ------------------------------------------------------------------ */
/* Volume by muscle                                                    */
/* ------------------------------------------------------------------ */

function VolumeCard({
  volume,
  unit,
}: {
  volume: TrainingAnalytics['volume']
  unit: Unit
}) {
  const sorted = [...volume].sort((a, b) => b.weeklyTonnage - a.weeklyTonnage)
  const max = Math.max(...sorted.map((v) => v.weeklyTonnage), 1)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Activity className="size-4 text-signal" aria-hidden />
          Volume by muscle
        </CardTitle>
        <CardDescription>
          This week&apos;s working sets and tonnage per muscle area.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2.5">
          {sorted.map((v) => (
            <li key={v.muscle} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium text-foreground">{v.muscle}</span>
                <span className="font-mono tabular-nums text-muted">
                  {num(v.weeklySets)} sets · {num(v.weeklyTonnage)} {unit}
                </span>
              </div>
              <Progress
                value={clamp((v.weeklyTonnage / max) * 100, 0, 100)}
                aria-label={`${v.muscle} tonnage`}
              />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Body trajectory                                                     */
/* ------------------------------------------------------------------ */

function BodyCard({
  body,
  unit,
}: {
  body: TrainingAnalytics['body']
  unit: Unit
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Scale className="size-4 text-signal" aria-hidden />
          Body trajectory
        </CardTitle>
        <CardDescription>
          {body.readings} {body.readings === 1 ? 'reading' : 'readings'} logged.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label={body.weightBasis === 'block_floor' ? 'Scale floor' : 'Weight'}
            value={body.latestWeight}
            unit={unit}
            precision={1}
            tone="signal"
          />
          <Stat
            label="Δ weight"
            value={body.weightChange != null ? signed(body.weightChange, 1) : null}
            unit={unit}
          />
          <Stat
            label="Rate / wk"
            value={body.weeklyRate != null ? signed(body.weeklyRate, 2) : null}
            unit={unit}
          />
          <Stat
            label="Body fat"
            value={body.latestBodyfat}
            unit="%"
            precision={1}
          />
        </div>
        {body.settling ? (
          <p className="mt-3 text-[11px] text-muted">
            Rate settling — early-diet water loss excluded.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Nutrition adherence                                                 */
/* ------------------------------------------------------------------ */

function NutritionCard({
  nutrition,
}: {
  nutrition: TrainingAnalytics['nutrition']
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Flame className="size-4 text-signal" aria-hidden />
          Nutrition adherence
        </CardTitle>
        <CardDescription>
          {nutrition.daysLogged}{' '}
          {nutrition.daysLogged === 1 ? 'day' : 'days'} logged.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <Stat
            label="Avg kcal"
            value={nutrition.avgCalories}
            tone="signal"
          />
          <Stat label="Target kcal" value={nutrition.calorieTarget} />
          <Stat
            label="Avg protein"
            value={nutrition.avgProtein}
            unit="g"
          />
        </div>
        {nutrition.adherencePct != null ? (
          <div className="flex items-center gap-3">
            <Progress
              value={clamp(nutrition.adherencePct, 0, 100)}
              aria-label="Calorie adherence"
              className="flex-1"
            />
            <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-muted">
              {num(nutrition.adherencePct)}%
            </span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted">
        {label}
      </span>
      <span className="font-mono tabular-nums text-foreground">{children}</span>
    </span>
  )
}

function GoalStatusBadge({ status }: { status: GoalAnalytic['status'] }) {
  switch (status) {
    case 'achieved':
      return <Badge variant="success">Achieved</Badge>
    case 'ahead':
      return <Badge variant="success">Ahead</Badge>
    case 'on_track':
      return <Badge variant="signal">On track</Badge>
    case 'behind':
      return <Badge variant="warning">Behind</Badge>
    default:
      return <Badge variant="muted">No data</Badge>
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function num(n: number | null | undefined, precision = 0): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(precision)
}

function signed(n: number | null | undefined, precision = 1): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const s = n.toFixed(precision)
  return n > 0 ? `+${s}` : s
}

function dateLabel(iso: string): string {
  try {
    return format(parseISO(iso), 'MMM d, yyyy')
  } catch {
    return iso.slice(0, 10)
  }
}
