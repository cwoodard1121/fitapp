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
} from 'lucide-react'
import { toast } from 'sonner'

import type { DailyHabitSummary } from '@/lib/data/habits'
import {
  createDailyHabit,
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

interface DailyHabitsCardProps {
  summaries: DailyHabitSummary[]
}

function days(value: number): string {
  return `${value} ${value === 1 ? 'day' : 'days'}`
}

export function DailyHabitsCard({ summaries }: DailyHabitsCardProps) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [name, setName] = React.useState('')
  const [pendingKey, setPendingKey] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const completedCount = summaries.reduce(
    (count, summary) => count + (summary.completedToday ? 1 : 0),
    0,
  )

  function openAddDialog() {
    setName('')
    setDialogOpen(true)
  }

  function createHabit(habitName: string) {
    const normalizedName = habitName.trim()
    if (!normalizedName) {
      toast.error('Give the habit a name.')
      return
    }

    setPendingKey('create')
    startTransition(async () => {
      try {
        const result = await createDailyHabit({ name: normalizedName })
        if (!result.ok) {
          toast.error(result.error)
          return
        }

        setName('')
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
    createHabit(name)
  }

  function toggleCompleted(summary: DailyHabitSummary) {
    const completed = !summary.completedToday
    setPendingKey(`complete:${summary.id}`)
    startTransition(async () => {
      try {
        const result = await setHabitCompleted({
          habitId: summary.id,
          completed,
        })
        if (!result.ok) {
          toast.error(result.error)
          return
        }

        toast.success(completed ? `${summary.name} done for today.` : `${summary.name} reopened.`)
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
                const completing = pendingKey === `complete:${summary.id}`
                const archiving = pendingKey === `archive:${summary.id}`

                return (
                  <li
                    key={summary.id}
                    className="flex flex-col gap-3 rounded-md border border-border bg-background p-3 sm:flex-row sm:items-center"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {summary.name}
                        </p>
                        <Badge variant={summary.completedToday ? 'success' : 'secondary'}>
                          <Flame aria-hidden />
                          {days(summary.currentStreak)}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted">
                        Best {days(summary.bestStreak)} /{' '}
                        {summary.totalCompletions.toLocaleString()} total
                      </p>
                    </div>

                    <div className="flex items-center gap-2 sm:shrink-0">
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
                        {summary.completedToday ? 'Done' : 'Mark done'}
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
                            <DropdownMenuItem onSelect={() => archiveHabit(summary)}>
                              <Archive aria-hidden />
                              Archive
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
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
  )
}
