'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  differenceInCalendarDays,
  format,
  isValid,
  parseISO,
} from 'date-fns'
import {
  CalendarClock,
  CheckCircle2,
  Dumbbell,
  MoreVertical,
  Pencil,
  RotateCcw,
  Trash2,
  XCircle,
} from 'lucide-react'

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Stat } from '@/components/ui/stat'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { setGoalStatus, deleteGoal } from '@/app/(app)/goals/actions'
import type { GoalWithCurrent } from './types'
import {
  computeProgress,
  computePacing,
  METRIC_LABELS,
  type PaceStatus,
} from './progress'

const PACE_META: Record<
  PaceStatus,
  { label: string; tone: string }
> = {
  reached: { label: 'Target reached', tone: 'text-gate-green' },
  ahead: { label: 'Ahead of pace', tone: 'text-gate-green' },
  'on-track': { label: 'On track', tone: 'text-signal' },
  behind: { label: 'Behind pace', tone: 'text-gate-yellow' },
  stalled: { label: 'Not on pace', tone: 'text-gate-red' },
}

/** Format a signed per-week rate, e.g. "-0.6 %/wk" or "+2.5 lb/wk". */
function fmtRate(n: number | null, unit: string | null): string | null {
  if (n == null || !Number.isFinite(n)) return null
  const v = Math.round(n * 100) / 100
  const sign = v > 0 ? '+' : ''
  const u = unit ? `${unit}/wk` : '/wk'
  return `${sign}${v} ${u}`
}

interface GoalCardProps {
  goal: GoalWithCurrent
  onEdit: (goal: GoalWithCurrent) => void
}

function fmtNum(n: number | null): string | null {
  if (n == null) return null
  // Drop trailing .0 but keep up to one decimal for fractional values.
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10)
}

function daysMeta(targetDate: string | null) {
  if (!targetDate) return null
  const d = parseISO(targetDate)
  if (!isValid(d)) return null
  const days = differenceInCalendarDays(d, new Date())
  return { days, date: d }
}

export function GoalCard({ goal, onEdit }: GoalCardProps) {
  const [pending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isActive = goal.status === 'active'
  const progress = computeProgress(goal.start_value, goal.current, goal.target_value)
  const dm = daysMeta(goal.target_date)
  const pacing =
    isActive
      ? computePacing(
          goal.start_value,
          goal.current,
          goal.target_value,
          goal.created_at,
          goal.target_date,
        )
      : null

  function runStatus(status: 'active' | 'achieved' | 'abandoned', msg: string) {
    startTransition(async () => {
      const res = await setGoalStatus(goal.id, status)
      if (res.ok) toast.success(msg)
      else toast.error(res.error)
    })
  }

  function runDelete() {
    startTransition(async () => {
      const res = await deleteGoal(goal.id)
      if (res.ok) {
        toast.success('Goal deleted.')
        setConfirmDelete(false)
      } else {
        toast.error(res.error)
      }
    })
  }

  const pctLabel =
    progress != null ? `${Math.round(progress.pct)}%` : null
  const reachedTarget = progress != null && progress.pct >= 100

  // Days-remaining tone: quiet by default, gate colours only at the edges.
  let daysTone = 'text-muted'
  let daysText: string | null = null
  if (dm) {
    if (dm.days < 0) {
      daysTone = 'text-gate-red'
      daysText = `${Math.abs(dm.days)}d overdue`
    } else if (dm.days === 0) {
      daysTone = 'text-gate-yellow'
      daysText = 'Due today'
    } else if (dm.days <= 7) {
      daysTone = 'text-gate-yellow'
      daysText = `${dm.days}d left`
    } else {
      daysText = `${dm.days}d left`
    }
  }

  return (
    <>
      <Card
        className={cn(
          'flex flex-col',
          !isActive && 'opacity-90',
        )}
      >
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                {goal.metric_type === 'e1rm' ? (
                  <Dumbbell aria-hidden />
                ) : null}
                {METRIC_LABELS[goal.metric_type]}
              </Badge>
              {goal.status === 'achieved' ? (
                <Badge variant="success" className="gap-1">
                  <CheckCircle2 aria-hidden />
                  Achieved
                </Badge>
              ) : null}
              {goal.status === 'abandoned' ? (
                <Badge variant="muted">Abandoned</Badge>
              ) : null}
            </div>
            <CardTitle className="truncate text-base">{goal.title}</CardTitle>
            {goal.metric_type === 'e1rm' && goal.exercise_name ? (
              <p className="truncate text-xs text-muted">{goal.exercise_name}</p>
            ) : null}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="-mr-2 -mt-1 shrink-0"
                aria-label="Goal actions"
              >
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => setTimeout(() => onEdit(goal), 0)}
              >
                <Pencil aria-hidden />
                Edit
              </DropdownMenuItem>
              {isActive ? (
                <DropdownMenuItem
                  onSelect={() => runStatus('abandoned', 'Goal abandoned.')}
                >
                  <XCircle aria-hidden />
                  Abandon
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onSelect={() => runStatus('active', 'Goal reactivated.')}
                >
                  <RotateCcw aria-hidden />
                  Reactivate
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-gate-red focus:text-gate-red"
                onSelect={() => setTimeout(() => setConfirmDelete(true), 0)}
              >
                <Trash2 aria-hidden />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>

        <CardContent className="flex-1 space-y-4">
          {/* Progress bar start -> current -> target */}
          {progress != null ? (
            <div className="space-y-2">
              <div className="flex items-end justify-between">
                <Stat
                  label="Progress"
                  value={pctLabel}
                  tone={reachedTarget ? 'signal' : 'default'}
                  size="lg"
                />
                {progress.remaining != null ? (
                  <span className="font-mono text-xs tabular-nums text-muted">
                    {fmtNum(Math.abs(progress.remaining))}
                    {goal.target_unit ? ` ${goal.target_unit}` : ''} to go
                  </span>
                ) : null}
              </div>
              <Progress value={progress.pct} aria-label="Progress to goal" />
              <div className="flex items-center justify-between font-mono text-[11px] tabular-nums text-muted">
                <span>
                  {fmtNum(goal.start_value) ?? '—'}
                  <span className="ml-1 text-muted/70">start</span>
                </span>
                <span className="text-foreground">
                  {fmtNum(goal.current) ?? '—'}
                  <span className="ml-1 text-muted">now</span>
                </span>
                <span>
                  {fmtNum(goal.target_value) ?? '—'}
                  <span className="ml-1 text-muted/70">target</span>
                </span>
              </div>
            </div>
          ) : (
            // Custom / not-yet-derivable: just show the target.
            <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-3">
              <Stat
                label="Target"
                value={fmtNum(goal.target_value)}
                unit={goal.target_unit ?? undefined}
                size="lg"
              />
              <span className="max-w-[55%] text-right text-xs leading-snug text-muted">
                {goal.metric_type === 'custom'
                  ? 'Tracked manually'
                  : 'No data yet — log a session to start tracking'}
              </span>
            </div>
          )}

          {dm ? (
            <div className="flex items-center gap-1.5 text-xs">
              <CalendarClock className="size-3.5 text-muted" aria-hidden />
              <span className="text-muted">
                {format(dm.date, 'MMM d, yyyy')}
              </span>
              {daysText ? (
                <span className={cn('font-mono tabular-nums', daysTone)}>
                  · {daysText}
                </span>
              ) : null}
            </div>
          ) : null}

          {pacing && pacing.status !== 'reached' ? (
            <div className="rounded-md border border-border bg-background px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
                  Pace
                </span>
                <span
                  className={cn(
                    'font-mono text-xs font-semibold',
                    PACE_META[pacing.status].tone,
                  )}
                >
                  {PACE_META[pacing.status].label}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono text-[11px] tabular-nums">
                {fmtRate(pacing.requiredPerWeek, goal.target_unit) ? (
                  <div className="flex flex-col">
                    <span className="text-muted/70">need</span>
                    <span className="text-foreground">
                      {fmtRate(pacing.requiredPerWeek, goal.target_unit)}
                    </span>
                  </div>
                ) : null}
                {fmtRate(pacing.actualPerWeek, goal.target_unit) ? (
                  <div className="flex flex-col">
                    <span className="text-muted/70">trending</span>
                    <span className="text-foreground">
                      {fmtRate(pacing.actualPerWeek, goal.target_unit)}
                    </span>
                  </div>
                ) : null}
                {pacing.projectedDate ? (
                  <div className="col-span-2 flex items-center justify-between border-t border-border/60 pt-1.5">
                    <span className="text-muted/70">projected arrival</span>
                    <span className="text-foreground">
                      ~ {format(parseISO(pacing.projectedDate), 'MMM d, yyyy')}
                    </span>
                  </div>
                ) : (
                  <div className="col-span-2 border-t border-border/60 pt-1.5 text-muted">
                    Not moving toward target yet — no ETA.
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {goal.notes ? (
            <p className="text-xs leading-snug text-muted">{goal.notes}</p>
          ) : null}
        </CardContent>

        {isActive ? (
          <CardFooter>
            <Button
              variant={reachedTarget ? 'default' : 'secondary'}
              className="w-full"
              disabled={pending}
              onClick={() => runStatus('achieved', 'Goal achieved — nice work.')}
            >
              <CheckCircle2 aria-hidden />
              {reachedTarget ? 'Lock it in — mark achieved' : 'Mark achieved'}
            </Button>
          </CardFooter>
        ) : null}
      </Card>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this goal?</DialogTitle>
            <DialogDescription>
              &ldquo;{goal.title}&rdquo; will be removed for good. This can&apos;t
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="ghost" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={runDelete}
            >
              <Trash2 aria-hidden />
              Delete goal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
