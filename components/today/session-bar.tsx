'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { CheckCircle2, Flag, Loader2, RotateCcw } from 'lucide-react'
import { format } from 'date-fns'

import type { SessionStatus } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { finishSession, reopenSession } from '@/app/(app)/today/actions'

interface SessionBarProps {
  sessionId: string
  dayLabel: string
  dayNumber: number
  week: number
  status: SessionStatus
  performedAt: string | null
  loggedCount: number
  totalSlots: number
}

/**
 * Sticky bottom action bar: shows the day + week context and the primary
 * "Finish session" CTA. On a completed session it flips to a quiet confirmation
 * with a reopen affordance.
 */
export function SessionBar({
  sessionId,
  dayLabel,
  dayNumber,
  week,
  status,
  performedAt,
  loggedCount,
  totalSlots,
}: SessionBarProps) {
  const [pending, startTransition] = React.useTransition()
  const done = status === 'done'

  function onFinish() {
    startTransition(async () => {
      const res = await finishSession({ sessionId })
      if (res.ok) toast.success('Session finished — nice work.')
      else toast.error(res.error)
    })
  }

  function onReopen() {
    startTransition(async () => {
      const res = await reopenSession({ sessionId })
      if (res.ok) toast.success('Session reopened.')
      else toast.error(res.error)
    })
  }

  return (
    <div className="sticky bottom-nav z-30 -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:bottom-0">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            Day {dayNumber} · {dayLabel}
          </p>
          <p className="font-mono text-xs tabular-nums text-muted">
            Week {week} ·{' '}
            {done && performedAt
              ? `done ${format(new Date(performedAt), 'MMM d, p')}`
              : `${loggedCount}/${totalSlots} logged`}
          </p>
        </div>

        {done ? (
          <div className="flex shrink-0 items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gate-green">
              <CheckCircle2 className="size-4" aria-hidden />
              Complete
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onReopen}
              disabled={pending}
            >
              <RotateCcw className="size-4" aria-hidden />
              Reopen
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            onClick={onFinish}
            disabled={pending}
            className="shrink-0"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Flag className="size-4" aria-hidden />
            )}
            Finish session
          </Button>
        )}
      </div>
    </div>
  )
}
