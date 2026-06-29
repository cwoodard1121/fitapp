'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { parseISO, startOfWeek, startOfMonth, format } from 'date-fns'
import { Flame, Pencil, TrendingDown, TrendingUp, Footprints } from 'lucide-react'

import type { NutritionLog, Unit } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Stat } from '@/components/ui/stat'
import { cn } from '@/lib/utils'
import { setMaintenanceCalories } from '@/app/(app)/nutrition/actions'

// kcal per unit of bodyfat (approx): 3500/lb, 7700/kg.
const KCAL_PER_LB = 3500
const KCAL_PER_KG = 7700

// Step-based activity adjustment: maintenance assumes a STEP_BASELINE-step day;
// each step under that trims the day's burn by ~0.04 kcal, scaled by bodyweight.
const STEP_BASELINE = 10000
const KCAL_PER_STEP = 0.04
const REF_WEIGHT_KG = 70
const DEFAULT_WEIGHT_KG = 70

type Win = 'week' | 'month' | 'block' | 'all'

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
): WindowResult {
  const todayD = parseISO(today)
  let start: Date
  switch (win) {
    case 'week':
      start = startOfWeek(todayD, { weekStartsOn: 1 })
      break
    case 'month':
      start = startOfMonth(todayD)
      break
    case 'block':
      start = blockStart ? parseISO(blockStart) : startOfWeek(todayD, { weekStartsOn: 1 })
      break
    case 'all':
      start = new Date(0)
      break
  }

  let deficit = 0
  let sumCalories = 0
  let sumMaint = 0
  let daysLogged = 0
  let adjustedDays = 0
  let totalAdjustment = 0

  for (const l of logs) {
    if (l.calories == null) continue
    const d = parseISO(l.logged_on)
    if (d < start || d > todayD) continue
    const steps = stepsByDate[l.logged_on]
    const adjustment =
      steps != null
        ? Math.max(0, STEP_BASELINE - steps) * KCAL_PER_STEP * (weightKg / REF_WEIGHT_KG)
        : 0
    const dayMaint = baseMaint - adjustment
    daysLogged += 1
    sumCalories += l.calories
    sumMaint += dayMaint
    deficit += dayMaint - l.calories
    if (adjustment > 0) {
      adjustedDays += 1
      totalAdjustment += adjustment
    }
  }

  return { daysLogged, deficit, sumCalories, sumMaint, adjustedDays, totalAdjustment, start }
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
  blockStart,
}: DeficitTrackerProps) {
  const router = useRouter()
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(maintenance != null ? String(maintenance) : '')
  const [pending, startTransition] = React.useTransition()
  const [win, setWin] = React.useState<Win>('week')

  function save() {
    const trimmed = draft.trim()
    const value = trimmed === '' ? null : Number(trimmed)
    startTransition(async () => {
      const res = await setMaintenanceCalories({ maintenance_calories: value })
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
            <Flame className="size-4" aria-hidden /> Calorie deficit
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted">
            Enter your maintenance calories and this tracks your real deficit — adjusted
            for how much you actually moved (steps from your watch) — so a low-step day
            shows a smaller loss, and a day over target is fine if the window still nets a
            loss.
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
              Your maintenance on a ~10k-step day. Days under 10k steps are trimmed
              automatically from your watch data.
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
  const windows: Win[] = blockStart ? ['week', 'month', 'block', 'all'] : ['week', 'month', 'all']
  const active = windows.includes(win) ? win : 'week'

  const r = computeWindow(logs, stepsByDate, maint, wk, active, today, blockStart)
  const inDeficit = r.deficit > 0
  const kcalPerUnit = unit === 'kg' ? KCAL_PER_KG : KCAL_PER_LB
  const estChange = r.deficit / kcalPerUnit
  const avgDaily = r.daysLogged ? Math.round(r.deficit / r.daysLogged) : 0

  const rangeLabel =
    active === 'all'
      ? 'all time'
      : active === 'block'
        ? `since ${format(r.start, 'MMM d')}`
        : active === 'month'
          ? `since ${format(r.start, 'MMM d')}`
          : `week of ${format(r.start, 'MMM d')}`

  // Cut-target comparison — the reassurance the user asked for (window-aware).
  let targetNote: { text: string; tone: string } | null = null
  if (r.daysLogged > 0) {
    if (calorieTarget != null) {
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
          <Flame className="size-4" aria-hidden /> Calorie deficit
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

        {r.daysLogged === 0 ? (
          <p className="text-sm text-muted">
            No days logged in this window yet. Log your intake to see your running deficit.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
              <Stat
                label="Deficit"
                value={fmtSigned(r.deficit)}
                unit="kcal"
                size="lg"
                tone={inDeficit ? 'green' : 'red'}
              />
              <Stat
                label={inDeficit ? 'Est. loss' : 'Est. gain'}
                value={Math.abs(estChange)}
                unit={unit}
                precision={2}
                size="lg"
                tone={inDeficit ? 'signal' : 'red'}
              />
              <Stat
                label="Avg/day vs maint"
                value={fmtSigned(avgDaily)}
                unit="kcal"
                size="default"
                tone={inDeficit ? 'green' : 'red'}
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
