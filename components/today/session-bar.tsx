'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { CheckCircle2, Flag, Loader2, RotateCcw } from 'lucide-react'
import { format } from 'date-fns'

import type { SessionStatus } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { dayName } from '@/lib/utils'
import { finishSession, getSessionRecap, reopenSession, type SessionRecapData } from '@/app/(app)/today/actions'
import { flushTrainingSaves } from '@/lib/client/training-save-queue'
import { SessionWrappedRecap } from '@/components/today/session-wrapped-recap'

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
 * Bottom action bar, fixed above the tab bar: day + progress and the primary
 * "finish session" action. A finished session flips to a quiet confirmation
 * with a reopen affordance. Fixed, not sticky (sticky floats mid-screen on
 * short pages); Today pads for it with `pb-session-room`.
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
  const [recap, setRecap] = React.useState<SessionRecapData | null>(null)
  const done = status === 'done'

  function onFinish() {
    startTransition(async () => {
      // Clicking the button blurs the active set field first. Yield once so its
      // onBlur can join the shared queue, then refuse to finish if that final
      // edit did not persist.
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
      await Promise.resolve()
      const savesOk = await flushTrainingSaves(sessionId)
      if (!savesOk) {
        toast.error('Finish stopped because a set did not save. Try again.')
        return
      }
      const res = await finishSession({ sessionId })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      const recapRes = await getSessionRecap({ sessionId })
      if (recapRes.ok) {
        setRecap(recapRes.data)
      } else {
        toast.success('Session finished — nice work.')
      }
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
    <div className="fixed inset-x-0 bottom-nav z-30 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-surface/85 md:bottom-0 md:left-60">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[0.9375rem] font-bold lowercase leading-tight text-foreground">
            day {dayNumber} · {dayName(dayLabel)}
          </p>
          <p className="mt-0.5 font-mono text-xs font-semibold text-muted">
            {done && performedAt
              ? `done ${format(new Date(performedAt), 'MMM d, p')}`
              : `${loggedCount} of ${totalSlots} logged · w${week}`}
          </p>
        </div>

        {done ? (
          <div className="flex shrink-0 items-center gap-1">
            <span className="inline-flex items-center gap-1.5 px-2 text-sm font-bold text-gate-green">
              <CheckCircle2 className="size-[1.125rem]" aria-hidden />
              done
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onReopen}
              disabled={pending}
            >
              <RotateCcw aria-hidden />
              reopen
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            onClick={onFinish}
            disabled={pending}
            className="shrink-0 px-6"
          >
            {pending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Flag aria-hidden />
            )}
            finish session
          </Button>
        )}
      </div>

      {recap ? (
        <SessionWrappedRecap
          open
          onOpenChange={(open) => {
            if (!open) setRecap(null)
          }}
          data={recap}
        />
      ) : null}
    </div>
  )
}
