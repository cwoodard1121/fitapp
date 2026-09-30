'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Archive,
  Check,
  Circle,
  Flame,
  Loader2,
  MoreVertical,
  Plus,
  RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'

import type { DailyHabitSummary } from '@/lib/data/habits'
import type { HabitKind } from '@/lib/types'
import {
  createDailyHabit,
  resetHabit,
  setHabitArchived,
  setHabitCompleted,
} from '@/app/(app)/today/habit-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TAP_SCALE, cn } from '@/lib/utils'

interface DailyHabitsCardProps {
  summaries: DailyHabitSummary[]
}

function days(value: number): string {
  return `${value} ${value === 1 ? 'day' : 'days'}`
}

/** build = did the thing, break = avoided the thing — copy/labeling only. */
function primaryActionLabel(kind: HabitKind, completedToday: boolean): string {
  if (kind === 'break') return completedToday ? 'Clean today' : 'Stayed clean'
  return completedToday ? 'Done' : 'Mark done'
}

function streakBadgeLabel(kind: HabitKind, value: number): string {
  return kind === 'break' ? `${days(value)} clean` : days(value)
}

function bestStreakLabel(kind: HabitKind): string {
  return kind === 'break' ? 'Longest clean run' : 'Best'
}

export function DailyHabitsCard({ summaries }: DailyHabitsCardProps) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [name, setName] = React.useState('')
  const [goalInput, setGoalInput] = React.useState('')
  const [kindInput, setKindInput] = React.useState<HabitKind>('build')
  const [resetTarget, setResetTarget] = React.useState<DailyHabitSummary | null>(null)
  const [pendingKey, setPendingKey] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const completedCount = summaries.reduce(
    (count, summary) => count + (summary.completedToday ? 1 : 0),
    0,
  )

  function openAddDialog() {
    setName('')
    setGoalInput('')
    setKindInput('build')
    setDialogOpen(true)
  }

  function createHabit(habitName: string, goalPerWeek?: number | null, kind?: HabitKind) {
    const normalizedName = habitName.trim()
    if (!normalizedName) {
      toast.error('Give the habit a name.')
      return
    }

    setPendingKey('create')
    startTransition(async () => {
      try {
        const result = await createDailyHabit({
          name: normalizedName,
          goalPerWeek: goalPerWeek ?? null,
          kind: kind ?? 'build',
        })
        if (!result.ok) {
          toast.error(result.error)
          return
        }

        setName('')
        setGoalInput('')
        setKindInput('build')
        setDialogOpen(false)
        toast.success(`${normalizedName} added.`)
        router.refresh()
      } finally {
        setPendingKey(null)
      }
    })
  }

  function submitCustomHabit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedGoal = goalInput.trim()
    const parsedGoal = trimmedGoal === '' ? null : Number(trimmedGoal)
    createHabit(name, parsedGoal, kindInput)
  }

  function toggleCompleted(summary: DailyHabitSummary, date?: string) {
    const isToday = date == null
    const wasCompleted = isToday
      ? summary.completedToday
      : summary.recentDays.find((d) => d.date === date)?.completed ?? false
    const completed = !wasCompleted
    setPendingKey(`complete:${summary.id}:${date ?? 'today'}`)
    startTransition(async () => {
      try {
        const result = await setHabitCompleted({
          habitId: summary.id,
          completed,
          date,
        })
        if (!result.ok) {
          toast.error(result.error)
          return
        }

        if (isToday) {
          toast.success(completed ? `${summary.name} done for today.` : `${summary.name} reopened.`)
        } else {
          toast.success(completed ? `Marked ${summary.name} done.` : `Unmarked that day.`)
        }
        router.refresh()
      } finally {
        setPendingKey(null)
      }
    })
  }

  function restoreHabit(habitId: string, habitName: string) {
    setPendingKey(`archive:${habitId}`)
    startTransition(async () => {
      try {
        const result = await setHabitArchived({ habitId, archived: false })
        if (!result.ok) {
          toast.error(result.error)
          return
        }

        toast.success(`${habitName} restored.`)
        router.refresh()
      } finally {
        setPendingKey(null)
      }
    })
  }

  function submitReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!resetTarget) return
    const trimmedName = name.trim()
    const trimmedGoal = goalInput.trim()

    setPendingKey(`reset:${resetTarget.id}`)
    startTransition(async () => {
      try {
        const result = await resetHabit({
          habitId: resetTarget.id,
          name: trimmedName || undefined,
          goalPerWeek: trimmedGoal === '' ? null : Number(trimmedGoal),
          kind: kindInput,
        })
        if (!result.ok) {
          toast.error(result.error)
          return
        }

        setResetTarget(null)
        toast.success(`${trimmedName || resetTarget.name} reset — fresh start.`)
        router.refresh()
      } finally {
        setPendingKey(null)
      }
    })
  }

  function openResetDialog(summary: DailyHabitSummary) {
    setName(summary.name)
    setGoalInput(summary.goalPerWeek != null ? String(summary.goalPerWeek) : '')
    setKindInput(summary.kind)
    setResetTarget(summary)
  }

  function archiveHabit(summary: DailyHabitSummary) {
    setPendingKey(`archive:${summary.id}`)
    startTransition(async () => {
      try {
        const result = await setHabitArchived({
          habitId: summary.id,
          archived: true,
        })
        if (!result.ok) {
          toast.error(result.error)
          return
        }

        router.refresh()
        toast(`${summary.name} archived.`, {
          action: {
            label: 'Undo',
            onClick: () => restoreHabit(summary.id, summary.name),
          },
        })
      } finally {
        setPendingKey(null)
      }
    })
  }

  return (
    <>
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <Card className="mt-4">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <CardTitle className="flex items-center gap-2 text-base">
                <Flame className="size-4 text-signal" aria-hidden />
                Daily habits
              </CardTitle>
              <CardDescription>
                Check in once a day and keep the streak moving.
              </CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant={completedCount > 0 ? 'signal' : 'muted'}>
                {summaries.length === 0
                  ? 'Ready to start'
                  : `${completedCount}/${summaries.length} done`}
              </Badge>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setName('')}
                  disabled={pending}
                >
                  <Plus data-icon="inline-start" aria-hidden />
                  Add
                </Button>
              </DialogTrigger>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {summaries.length === 0 ? (
            <div
              className="flex flex-col gap-4 rounded-md border border-dashed border-border bg-background p-4"
            >
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-foreground">Start a daily streak</p>
                <p className="text-xs leading-relaxed text-muted">
                  Creatine is a good first habit, or add anything you want to do every day.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  onClick={() => createHabit('Creatine')}
                  disabled={pending}
                >
                  {pendingKey === 'create' ? (
                    <Loader2
                      data-icon="inline-start"
                      className="animate-spin"
                      aria-hidden
                    />
                  ) : (
                    <Plus data-icon="inline-start" aria-hidden />
                  )}
                  Track Creatine
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={openAddDialog}
                  disabled={pending}
                  aria-haspopup="dialog"
                  aria-expanded={dialogOpen}
                >
                  Add something else
                </Button>
              </div>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {summaries.map((summary) => {
                const completing = pendingKey === `complete:${summary.id}:today`
                const archiving = pendingKey === `archive:${summary.id}`

                return (
                  <li
                    key={summary.id}
                    className="flex flex-col gap-3 rounded-md border border-border bg-background p-3"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {summary.name}
                          </p>
                          <Badge variant={summary.completedToday ? 'success' : 'secondary'}>
                            <Flame aria-hidden />
                            {streakBadgeLabel(summary.kind, summary.currentStreak)}
                          </Badge>
                          {summary.goalPerWeek != null ? (
                            <Badge
                              variant={
                                summary.completionsThisWeek >= summary.goalPerWeek
                                  ? 'success'
                                  : 'muted'
                              }
                            >
                              {summary.completionsThisWeek}/{summary.goalPerWeek} this wk
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted">
                          {bestStreakLabel(summary.kind)} {days(summary.bestStreak)} /{' '}
                          {summary.totalCompletions.toLocaleString()} total
                        </p>
                      </div>

                      <div className="flex items-center gap-2 sm:shrink-0">
                        {(() => {
                          const yesterday =
                            summary.recentDays[summary.recentDays.length - 2]
                          if (!yesterday) return null
                          const isPending =
                            pendingKey === `complete:${summary.id}:${yesterday.date}`
                          return (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="hidden shrink-0 sm:inline-flex"
                              onClick={() => toggleCompleted(summary, yesterday.date)}
                              disabled={pending}
                              aria-pressed={yesterday.completed}
                              title="Toggle yesterday — for when you forgot to check in"
                            >
                              {isPending ? (
                                <Loader2
                                  data-icon="inline-start"
                                  className="animate-spin"
                                  aria-hidden
                                />
                              ) : yesterday.completed ? (
                                <Check data-icon="inline-start" aria-hidden />
                              ) : (
                                <Circle data-icon="inline-start" aria-hidden />
                              )}
                              Yesterday
                            </Button>
                          )
                        })()}

                        <Button
                          type="button"
                          variant={summary.completedToday ? 'secondary' : 'default'}
                          size="sm"
                          className="flex-1 sm:flex-none"
                          onClick={() => toggleCompleted(summary)}
                          disabled={pending}
                          aria-pressed={summary.completedToday}
                        >
                          {completing ? (
                            <Loader2
                              data-icon="inline-start"
                              className="animate-spin"
                              aria-hidden
                            />
                          ) : summary.completedToday ? (
                            <Check data-icon="inline-start" aria-hidden />
                          ) : (
                            <Circle data-icon="inline-start" aria-hidden />
                          )}
                          {primaryActionLabel(summary.kind, summary.completedToday)}
                        </Button>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              disabled={pending}
                              aria-label={`Actions for ${summary.name}`}
                            >
                              {archiving ? (
                                <Loader2
                                  data-icon="inline-start"
                                  className="animate-spin"
                                  aria-hidden
                                />
                              ) : (
                                <MoreVertical data-icon="inline-start" aria-hidden />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                              <DropdownMenuItem onSelect={() => openResetDialog(summary)}>
                                <RotateCcw aria-hidden />
                                Reset
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => archiveHabit(summary)}>
                                <Archive aria-hidden />
                                Archive
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    <RecentDayStrip
                      summary={summary}
                      pendingKey={pendingKey}
                      onToggle={(date) => toggleCompleted(summary, date)}
                    />
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <DialogContent className="sm:max-w-md">
        <form className="flex flex-col gap-4" onSubmit={submitCustomHabit}>
          <DialogHeader>
            <DialogTitle>Add a daily habit</DialogTitle>
            <DialogDescription>
              Name something you want to check off every day.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="daily-habit-name">Habit name</Label>
            <Input
              id="daily-habit-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Creatine"
              maxLength={60}
              autoComplete="off"
              autoFocus
              required
              disabled={pending}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Kind</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={kindInput === 'build' ? 'default' : 'outline'}
                onClick={() => setKindInput('build')}
                disabled={pending}
                aria-pressed={kindInput === 'build'}
              >
                Build a habit
              </Button>
              <Button
                type="button"
                variant={kindInput === 'break' ? 'default' : 'outline'}
                onClick={() => setKindInput('break')}
                disabled={pending}
                aria-pressed={kindInput === 'break'}
              >
                Break a habit
              </Button>
            </div>
            <p className="text-xs text-muted">
              {kindInput === 'break'
                ? 'e.g. No smoking — marking a day means you stayed clean.'
                : 'e.g. Creatine — marking a day means you did the thing.'}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="daily-habit-goal">Times per week (optional)</Label>
            <Input
              id="daily-habit-goal"
              type="number"
              inputMode="numeric"
              min={1}
              max={7}
              step={1}
              value={goalInput}
              onChange={(event) => setGoalInput(event.target.value)}
              placeholder="Every day"
              disabled={pending}
            />
            <p className="text-xs text-muted">
              Leave blank to track this as a daily streak. Set a number to track a
              weekly target instead (e.g. 3x a week).
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending || name.trim().length === 0}>
              {pendingKey === 'create' ? (
                <Loader2
                  data-icon="inline-start"
                  className="animate-spin"
                  aria-hidden
                />
              ) : (
                <Plus data-icon="inline-start" aria-hidden />
              )}
              Add habit
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog
      open={resetTarget != null}
      onOpenChange={(open) => {
        if (!open) setResetTarget(null)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form className="flex flex-col gap-4" onSubmit={submitReset}>
          <DialogHeader>
            <DialogTitle>Reset {resetTarget?.name}?</DialogTitle>
            <DialogDescription>
              Clears this habit&apos;s streak and history so you can start fresh
              right now. The habit itself stays — it is not archived or deleted.
              This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="reset-habit-name">Habit name</Label>
            <Input
              id="reset-habit-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={60}
              autoComplete="off"
              required
              disabled={pending}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Kind</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={kindInput === 'build' ? 'default' : 'outline'}
                onClick={() => setKindInput('build')}
                disabled={pending}
                aria-pressed={kindInput === 'build'}
              >
                Build a habit
              </Button>
              <Button
                type="button"
                variant={kindInput === 'break' ? 'default' : 'outline'}
                onClick={() => setKindInput('break')}
                disabled={pending}
                aria-pressed={kindInput === 'break'}
              >
                Break a habit
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="reset-habit-goal">Times per week (optional)</Label>
            <Input
              id="reset-habit-goal"
              type="number"
              inputMode="numeric"
              min={1}
              max={7}
              step={1}
              value={goalInput}
              onChange={(event) => setGoalInput(event.target.value)}
              placeholder="Every day"
              disabled={pending}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={pending || name.trim().length === 0}>
              {pendingKey === `reset:${resetTarget?.id}` ? (
                <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden />
              ) : (
                <RotateCcw data-icon="inline-start" aria-hidden />
              )}
              Reset
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  )
}

/** Last-7-days backfill strip — tap any day to toggle it, not just today. */
function RecentDayStrip({
  summary,
  pendingKey,
  onToggle,
}: {
  summary: DailyHabitSummary
  pendingKey: string | null
  onToggle: (date: string) => void
}) {
  const todayDate = summary.recentDays[summary.recentDays.length - 1]?.date

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Last 7 days">
      {summary.recentDays.map((day) => {
        const isToday = day.date === todayDate
        const isPending = pendingKey === `complete:${summary.id}:${day.date}`
        const weekdayLabel = format(parseISO(day.date), 'EEEEE')

        return (
          <button
            key={day.date}
            type="button"
            onClick={() => onToggle(day.date)}
            disabled={pendingKey != null}
            aria-pressed={day.completed}
            aria-label={`${format(parseISO(day.date), 'EEEE, MMM d')}${
              day.completed ? ', completed' : ', not completed'
            }`}
            title={format(parseISO(day.date), 'EEE, MMM d')}
            className={cn(
              'flex size-7 flex-col items-center justify-center gap-0.5 rounded-md border text-[9px] font-medium uppercase text-muted',
              TAP_SCALE,
              day.completed
                ? 'border-signal/40 bg-signal/15 text-signal'
                : 'border-border bg-background hover:border-muted',
              isToday && !day.completed ? 'border-dashed' : '',
              'disabled:pointer-events-none disabled:opacity-60',
            )}
          >
            {isPending ? (
              <Loader2 className="size-3 animate-spin" aria-hidden />
            ) : day.completed ? (
              <Check className="size-3" aria-hidden />
            ) : (
              <span aria-hidden>{weekdayLabel}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
