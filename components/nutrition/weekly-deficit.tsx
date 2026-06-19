'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { differenceInCalendarDays, parseISO, startOfWeek, format } from 'date-fns'
import { Flame, Pencil, TrendingDown, TrendingUp } from 'lucide-react'

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

interface WeeklyDeficitProps {
  logs: NutritionLog[]
  today: string
  maintenance: number | null
  /** Active diet block's daily calorie target (the "cut target"), if any. */
  calorieTarget: number | null
  unit: Unit
}

function fmtSigned(n: number): string {
  const r = Math.round(n)
  return `${r > 0 ? '+' : ''}${r.toLocaleString()}`
}

export function WeeklyDeficit({
  logs,
  today,
  maintenance,
  calorieTarget,
  unit,
}: WeeklyDeficitProps) {
  const router = useRouter()
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(
    maintenance != null ? String(maintenance) : '',
  )
  const [pending, startTransition] = React.useTransition()

  // Current calendar week (Mon -> today).
  const week = React.useMemo(() => {
    const todayDate = parseISO(today)
    const weekStart = startOfWeek(todayDate, { weekStartsOn: 1 })
    const daysElapsed = differenceInCalendarDays(todayDate, weekStart) + 1
    const inWeek = logs.filter((l) => {
      const d = parseISO(l.logged_on)
      return d >= weekStart && d <= todayDate
    })
    const logged = inWeek.filter((l) => l.calories != null)
    const sumCalories = logged.reduce((s, l) => s + (l.calories ?? 0), 0)
    return {
      weekStart,
      daysElapsed,
      daysLogged: logged.length,
      sumCalories,
    }
  }, [logs, today])

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
            <Flame className="size-4" aria-hidden /> Weekly deficit
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted">
            Enter your maintenance calories and this tracks your real weekly
            deficit — so a day over your target is fine as long as the week still
            nets a loss.
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
              Your best estimate of the intake that holds your weight steady.
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

  // --- Maintenance known: compute the week's deficit + estimated change. ---
  const maint = maintenance as number
  const { daysLogged, daysElapsed, sumCalories } = week
  const maintForLogged = maint * daysLogged
  const deficit = maintForLogged - sumCalories // + = deficit (good for a cut)
  const inDeficit = deficit > 0
  const kcalPerUnit = unit === 'kg' ? KCAL_PER_KG : KCAL_PER_LB
  const estChange = deficit / kcalPerUnit // + lb/kg lost
  const avgDaily = daysLogged ? Math.round(deficit / daysLogged) : 0

  // Cut-target comparison — the reassurance the user asked for.
  let targetNote: { text: string; tone: string } | null = null
  if (daysLogged > 0) {
    if (calorieTarget != null) {
      const targetForLogged = calorieTarget * daysLogged
      const overTarget = sumCalories - targetForLogged // + = ate over the cut target
      if (overTarget > 0 && inDeficit) {
        targetNote = {
          text: `You're ${fmtSigned(overTarget)} over your cut target this week — but still ${Math.round(deficit).toLocaleString()} under maintenance. Still on a loss: about ${estChange.toFixed(2)} ${unit}.`,
          tone: 'text-gate-green',
        }
      } else if (!inDeficit) {
        targetNote = {
          text: `Net ${fmtSigned(-deficit)} over maintenance this week — no loss yet. Tighten it up.`,
          tone: 'text-gate-red',
        }
      } else {
        targetNote = {
          text: `On plan — under both your cut target and maintenance. About ${estChange.toFixed(2)} ${unit} this week.`,
          tone: 'text-gate-green',
        }
      }
    } else if (!inDeficit) {
      targetNote = {
        text: `Net ${fmtSigned(-deficit)} over maintenance this week — no loss yet.`,
        tone: 'text-gate-red',
      }
    } else {
      targetNote = {
        text: `About ${estChange.toFixed(2)} ${unit} under maintenance so far this week.`,
        tone: 'text-gate-green',
      }
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted">
          <Flame className="size-4" aria-hidden /> Weekly deficit
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
        {daysLogged === 0 ? (
          <p className="text-sm text-muted">
            No days logged this week yet. Log today&rsquo;s intake to see your
            running deficit.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
              <Stat
                label="Deficit this week"
                value={fmtSigned(deficit)}
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
              <p
                className={cn(
                  'flex items-start gap-2 text-sm leading-snug',
                  targetNote.tone,
                )}
              >
                {inDeficit ? (
                  <TrendingDown className="mt-0.5 size-4 shrink-0" aria-hidden />
                ) : (
                  <TrendingUp className="mt-0.5 size-4 shrink-0" aria-hidden />
                )}
                <span>{targetNote.text}</span>
              </p>
            ) : null}

            <p className="font-mono text-[11px] tabular-nums text-muted">
              {daysLogged}/{daysElapsed} days logged · week of{' '}
              {format(week.weekStart, 'MMM d')} · {sumCalories.toLocaleString()} kcal
              eaten vs {maintForLogged.toLocaleString()} maintenance
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
