'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'
import { CalendarDays, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { setStartDate } from '@/app/(app)/mesocycle/actions'

export function StartDateForm({
  programId,
  initialStartDate,
}: {
  programId: string
  initialStartDate: string | null
}) {
  const [value, setValue] = useState(initialStartDate ?? '')
  const [pending, startTransition] = useTransition()

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      const res = await setStartDate({ programId, startDate: value })
      if (res.ok) {
        toast.success(
          value ? 'Start date updated.' : 'Start date cleared.',
        )
      } else {
        toast.error(res.error)
      }
    })
  }

  const dirty = (value || '') !== (initialStartDate ?? '')

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="start-date">Program start date</Label>
        <div className="relative">
          <CalendarDays
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            id="start-date"
            name="start-date"
            type="date"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={pending}
            className="h-12 w-full rounded-md border border-border bg-background pl-9 pr-3 font-mono text-base sm:text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-60"
          />
        </div>
        <p className="text-xs text-muted">
          Week 1 begins on this date. It keeps the current-week math honest.
        </p>
      </div>
      <Button
        type="submit"
        size="lg"
        disabled={pending || !dirty}
        className="sm:w-auto"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Saving
          </>
        ) : (
          'Save date'
        )}
      </Button>
    </form>
  )
}
