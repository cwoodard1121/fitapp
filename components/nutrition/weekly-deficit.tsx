'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { parseISO, startOfWeek, subDays, format } from 'date-fns'
import { Flame, Pencil, TrendingDown, TrendingUp, Footprints } from 'lucide-react'

import type { NutritionLog, Unit } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Stat } from '@/components/ui/stat'
import { cn } from '@/lib/utils'
import { setMaintenanceCalories, setNutritionOutlier } from '@/app/(app)/nutrition/actions'
import {
  accumulateDeficit,
  DEFAULT_STEP_BASELINE,
  DEFAULT_WEIGHT_KG,
  KCAL_PER_KG,
  KCAL_PER_LB,
  TRACKING_START,
} from '@/lib/nutrition/deficit'

type Win = 'week' | 'month' | 'block' | 'all'

/** Goal framing — derived from the active diet block's phase (default cut). */
type Mode = 'cut' | 'surplus' | 'maintain'
function deriveMode(phase: string | null | undefined): Mode {
  if (phase === 'bulk') return 'surplus'
  if (phase === 'maintain' || phase === 'recomp') return 'maintain'
  return 'cut'
}
/** kcal/day within maintenance still counts as "holding" in maintain mode. */
const MAINTAIN_BAND = 150

interface DeficitTrackerProps {
  logs: NutritionLog[]
  today: string
  maintenance: number | null
  /** Active diet block's daily calorie target (the "cut target"), if any. */
  calorieTarget: number | null
  unit: Unit
  /** metric_date -> steps, for the activity-adjusted maintenance. */
  stepsByDate: Record<string, number>
  /** Latest bodyweight in KG (for the step formula); null -> a 70kg default. */
  weightKg: number | null
  /** Steps/day the maintenance assumes; null -> 10000 default. */
  stepBaseline: number | null
  /** Outlier filter: ignore completed days under this many kcal. null = off. */
  minCalories: number | null
  /** Active diet block phase ('cut' | 'bulk' | 'maintain' | 'recomp' | null) → goal mode. */
  phase: string | null
  /** Active diet block start date (YYYY-MM-DD), for the "Block" window. */
  blockStart: string | null
}

function fmtSigned(n: number): string {
  const r = Math.round(n)
  return `${r > 0 ? '+' : ''}${r.toLocaleString()}`
}

interface WindowResult {
  daysLogged: number
  deficit: number
  sumCalories: number
  sumMaint: number
  adjustedDays: number
  totalAdjustment: number
  start: Date
}

/** Compute the activity-adjusted deficit over the selected window. */
function computeWindow(
  logs: NutritionLog[],
  stepsByDate: Record<string, number>,
  baseMaint: number,
  weightKg: number,
  win: Win,
  today: string,
  blockStart: string | null,
  ignoreLow: boolean,
  minCal: number,
  stepBaseline: number,
): WindowResult {
  const todayD = parseISO(today)
  let start: Date
  switch (win) {
    case 'week':
      start = startOfWeek(todayD, { weekStartsOn: 1 })
      break
    case 'month':
      // Rolling 30-day window, inclusive of today (not the calendar month).
      start = subDays(todayD, 29)
      break
    case 'block':
      start = blockStart ? parseISO(blockStart) : startOfWeek(todayD, { weekStartsOn: 1 })
      break
    case 'all':
      start = new Date(0)
      break
  }

  // The active diet block's start is a HARD floor — every window stays inside the
  // block, so a week/30-day window can't reach back before the block began.
  if (blockStart) {
    const bs = parseISO(blockStart)
    if (start < bs) start = bs
  }
  // ...and never before the tracking start (pre-cut data is noise for averages).
  if (start < TRACKING_START) start = TRACKING_START

  const r = accumulateDeficit({
    logs,
    stepsByDate,
    baseMaint,
    weightKg,
    stepBaseline,
    ignoreLow,
    minCal,
    start,
    end: todayD,
    today,
  })
  return { ...r, start }
}

const WIN_LABEL: Record<Win, string> = {
  week: 'Week',
  month: 'Month',
  block: 'Block',
  all: 'All',
}

export function DeficitTracker({
  logs,
  today,
  maintenance,
  calorieTarget,
  unit,
  stepsByDate,
  weightKg,
  stepBaseline,
  minCalories,
  phase,
  blockStart,
}: DeficitTrackerProps) {
  const mode = deriveMode(phase)
  const cardTitle =
    mode === 'surplus' ? 'Calorie surplus' : mode === 'maintain' ? 'Energy balance' : 'Calorie deficit'
  const router = useRouter()
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(maintenance != null ? String(maintenance) : '')
  const [stepDraft, setStepDraft] = React.useState(
    stepBaseline != null ? String(stepBaseline) : String(DEFAULT_STEP_BASELINE),
  )
  const [pending, startTransition] = React.useTransition()
  const [win, setWin] = React.useState<Win>('week')
  // Outlier filter, seeded from the profile (null = off) so it syncs across devices.
  const [ignoreLow, setIgnoreLow] = React.useState(minCalories != null)
  const [minCal, setMinCal] = React.useState(minCalories ?? 1200)

  /** Persist the outlier filter to the profile (null = off). Fire-and-forget. */
  function persistOutlier(min: number | null) {
    void setNutritionOutlier({ min_calories: min }).then((res) => {
      if (!res.ok) toast.error(res.error)
    })
  }
  function toggleIgnore(checked: boolean) {
    setIgnoreLow(checked)
    persistOutlier(checked ? minCal : null)
  }

  function save() {
    const trimmed = draft.trim()
    const value = trimmed === '' ? null : Number(trimmed)
    const stepTrimmed = stepDraft.trim()
    const step = stepTrimmed === '' ? null : Number(stepTrimmed)
    startTransition(async () => {
      const res = await setMaintenanceCalories({ maintenance_calories: value, step_baseline: step })
      if (res.ok) {
        toast.success(value == null ? 'Maintenance cleared.' : 'Maintenance saved.')
        setEditing(false)
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  // --- No maintenance set yet: prompt to enter it. ---
  if (maintenance == null && !editing) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted">
            <Flame className="size-4" aria-hidden /> {cardTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted">
            Enter your maintenance calories and this tracks your real balance vs
            maintenance — adjusted for how much you actually moved (steps from your watch),
            so a low-step day counts for less.
          </p>
          <div className="mt-3">
            <Button variant="outline" onClick={() => setEditing(true)}>
              Set maintenance
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (editing) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted">
            <Flame className="size-4" aria-hidden /> Maintenance calories
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="maintenance">Daily maintenance (kcal)</Label>
            <Input
              id="maintenance"
              type="number"
              inputMode="numeric"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="e.g. 2600"
              className="font-mono tabular-nums"
            />
            <p className="text-xs text-muted">
              The intake that holds your weight steady on a typical day.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="step-baseline">…at about (steps/day)</Label>
            <Input
              id="step-baseline"
              type="number"
              inputMode="numeric"
              value={stepDraft}
              onChange={(e) => setStepDraft(e.target.value)}
              placeholder="10000"
              className="font-mono tabular-nums"
            />
            <p className="text-xs text-muted">
              The activity your maintenance assumes. Days under this many steps get
              trimmed automatically from your watch data.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={save} disabled={pending}>
              Save
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setEditing(false)
                setDraft(maintenance != null ? String(maintenance) : '')
                setStepDraft(
                  stepBaseline != null ? String(stepBaseline) : String(DEFAULT_STEP_BASELINE),
                )
              }}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // --- Maintenance known: compute the selected window's deficit. ---
  const maint = maintenance as number
  const wk = weightKg && weightKg > 0 ? weightKg : DEFAULT_WEIGHT_KG
  const baseline = stepBaseline && stepBaseline > 0 ? stepBaseline : DEFAULT_STEP_BASELINE
  // With an active block, every window is clamped to its start, so a separate
  // "All" would just equal "Block" — drop it.
  const windows: Win[] = blockStart ? ['week', 'month', 'block'] : ['week', 'month', 'all']
  const active = windows.includes(win) ? win : 'week'

  const r = computeWindow(logs, stepsByDate, maint, wk, active, today, blockStart, ignoreLow, minCal, baseline)
  const inDeficit = r.deficit > 0
  const kcalPerUnit = unit === 'kg' ? KCAL_PER_KG : KCAL_PER_LB
  const estChange = r.deficit / kcalPerUnit
  // Signed vs maintenance: negative = under maintenance (a deficit), shown as -X.
  const avgDaily = r.daysLogged ? Math.round(-r.deficit / r.daysLogged) : 0
  const surplus = -r.deficit // total intake − adjusted maintenance over the window
  const losing = r.deficit > 0 // tissue direction (down = losing)
  // "On track" toward the mode's goal — drives the colors. For cut this is the
  // old `inDeficit`, so cut behavior is unchanged.
  const onTrack =
    mode === 'cut'
      ? r.deficit > 0
      : mode === 'surplus'
        ? surplus > 0
        : Math.abs(avgDaily) <= MAINTAIN_BAND

  const rangeLabel =
    active === 'all'
      ? 'all time'
      : active === 'block'
        ? `since ${format(r.start, 'MMM d')}`
        : active === 'month'
          ? `since ${format(r.start, 'MMM d')}`
          : `week of ${format(r.start, 'MMM d')}`

  // Window note — framed by the goal mode (cut keeps the cut-target logic).
  let targetNote: { text: string; tone: string } | null = null
  if (r.daysLogged > 0) {
    if (mode === 'surplus') {
      targetNote = onTrack
        ? {
            text: `Building — about +${Math.abs(estChange).toFixed(2)} ${unit} on a ${fmtSigned(avgDaily)} kcal/day surplus.`,
            tone: 'text-gate-green',
          }
        : {
            text: `Only ${fmtSigned(avgDaily)} kcal/day vs maintenance — not a surplus yet. Eat a bit more.`,
            tone: 'text-gate-yellow',
          }
    } else if (mode === 'maintain') {
      targetNote = onTrack
        ? {
            text: `Holding steady — averaging ${fmtSigned(avgDaily)} kcal/day vs maintenance.`,
            tone: 'text-gate-green',
          }
        : {
            text: `Drifting ${avgDaily < 0 ? 'under' : 'over'} — averaging ${fmtSigned(avgDaily)} kcal/day vs maintenance.`,
            tone: 'text-gate-yellow',
          }
    } else if (calorieTarget != null) {
      const targetForLogged = calorieTarget * r.daysLogged
      const overTarget = r.sumCalories - targetForLogged
      if (overTarget > 0 && inDeficit) {
        targetNote = {
          text: `You're ${fmtSigned(overTarget)} over your cut target — but still ${Math.round(r.deficit).toLocaleString()} under (adjusted) maintenance. Still a loss: about ${estChange.toFixed(2)} ${unit}.`,
          tone: 'text-gate-green',
        }
      } else if (!inDeficit) {
        targetNote = {
          text: `Net ${fmtSigned(-r.deficit)} over maintenance — no loss yet. Tighten it up.`,
          tone: 'text-gate-red',
        }
      } else {
        targetNote = {
          text: `On plan — under both your cut target and maintenance. About ${estChange.toFixed(2)} ${unit}.`,
          tone: 'text-gate-green',
        }
      }
    } else if (!inDeficit) {
      targetNote = {
        text: `Net ${fmtSigned(-r.deficit)} over maintenance — no loss yet.`,
        tone: 'text-gate-red',
      }
    } else {
      targetNote = {
        text: `About ${estChange.toFixed(2)} ${unit} under maintenance.`,
        tone: 'text-gate-green',
      }
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted">
          <Flame className="size-4" aria-hidden /> {cardTitle}
        </CardTitle>
        <button
          type="button"
          onClick={() => {
            setDraft(String(maint))
            setEditing(true)
          }}
          className="inline-flex items-center gap-1 font-mono text-xs text-muted hover:text-foreground"
        >
          <Pencil className="size-3" aria-hidden />
          {maint.toLocaleString()} kcal maint
        </button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {/* Window toggle */}
          <div className="inline-flex rounded-md border border-border p-0.5">
            {windows.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWin(w)}
                className={cn(
                  'rounded px-3 py-1 text-xs font-medium transition-colors',
                  active === w ? 'bg-signal text-signal-foreground' : 'text-muted hover:text-foreground',
                )}
              >
                {WIN_LABEL[w]}
              </button>
            ))}
          </div>

          {/* Outlier filter — drop under-logged completed days from the stats. */}
          <label className="flex items-center gap-2 text-xs text-muted">
            <Switch
              checked={ignoreLow}
              onCheckedChange={toggleIgnore}
              aria-label="Ignore low-calorie days"
            />
            <span className="whitespace-nowrap">Ignore days under</span>
            <Input
              type="number"
              inputMode="numeric"
              value={String(minCal)}
              onChange={(e) => setMinCal(Math.max(0, Math.round(Number(e.target.value) || 0)))}
              onBlur={() => {
                if (ignoreLow) persistOutlier(minCal)
              }}
              disabled={!ignoreLow}
              aria-label="Minimum calories"
              className="h-7 w-16 px-2 py-1 text-center font-mono text-xs tabular-nums"
            />
            <span>kcal</span>
          </label>
        </div>

        {r.daysLogged === 0 ? (
          <p className="text-sm text-muted">
            No days logged in this window yet. Log your intake to see your running numbers.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
              <Stat
                label={mode === 'surplus' ? 'Surplus' : mode === 'maintain' ? 'Net vs maint' : 'Deficit'}
                value={fmtSigned(mode === 'cut' ? r.deficit : surplus)}
                unit="kcal"
                size="lg"
                tone={onTrack ? 'green' : 'red'}
              />
              <Stat
                label={losing ? 'Est. tissue loss' : 'Est. tissue gain'}
                value={Math.abs(estChange)}
                unit={unit}
                precision={2}
                size="lg"
                tone={onTrack ? 'signal' : 'red'}
              />
              <Stat
                label="Avg/day vs maint"
                value={fmtSigned(avgDaily)}
                unit="kcal"
                size="default"
                tone={onTrack ? 'green' : 'red'}
              />
            </div>

            {targetNote ? (
              <p className={cn('flex items-start gap-2 text-sm leading-snug', targetNote.tone)}>
                {inDeficit ? (
                  <TrendingDown className="mt-0.5 size-4 shrink-0" aria-hidden />
                ) : (
                  <TrendingUp className="mt-0.5 size-4 shrink-0" aria-hidden />
                )}
                <span>{targetNote.text}</span>
              </p>
            ) : null}

            {r.adjustedDays > 0 ? (
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <Footprints className="size-3.5 shrink-0 text-signal" aria-hidden />
                Activity-adjusted: −{Math.round(r.totalAdjustment).toLocaleString()} kcal across{' '}
                {r.adjustedDays} low-step {r.adjustedDays === 1 ? 'day' : 'days'}.
              </p>
            ) : null}

            <p className="font-mono text-[11px] tabular-nums text-muted">
              {r.daysLogged} days logged · {rangeLabel} · {Math.round(r.sumCalories).toLocaleString()}{' '}
              kcal eaten vs {Math.round(r.sumMaint).toLocaleString()} adj. maintenance
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** @deprecated old name — kept so existing imports don't break. */
export const WeeklyDeficit = DeficitTracker
