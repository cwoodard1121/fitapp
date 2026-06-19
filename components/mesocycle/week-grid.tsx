import Link from 'next/link'
import {
  ArrowRight,
  BatteryLow,
  Check,
  Crosshair,
  Minus,
  X,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import type { SessionStatus } from '@/lib/types'

export type DayCell = {
  dayId: string
  label: string
  dayNumber: number
  status: SessionStatus
}

export type WeekRow = {
  week: number
  isCurrent: boolean
  isDeload: boolean
  isCalibration: boolean
  days: DayCell[]
  doneCount: number
  plannedCount: number
}

const statusMeta: Record<
  SessionStatus,
  { tone: string; Icon: typeof Check; label: string }
> = {
  done: {
    tone: 'border-gate-green/40 bg-gate-green/10 text-gate-green',
    Icon: Check,
    label: 'Done',
  },
  in_progress: {
    tone: 'border-gate-yellow/40 bg-gate-yellow/10 text-gate-yellow',
    Icon: Minus,
    label: 'In progress',
  },
  skipped: {
    tone: 'border-gate-red/40 bg-gate-red/10 text-gate-red',
    Icon: X,
    label: 'Skipped',
  },
  planned: {
    tone: 'border-border bg-background text-muted',
    Icon: Minus,
    label: 'Planned',
  },
}

function WeekCard({ row }: { row: WeekRow }) {
  const pct =
    row.plannedCount > 0
      ? Math.round((row.doneCount / row.plannedCount) * 100)
      : 0
  const complete = row.plannedCount > 0 && row.doneCount === row.plannedCount

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg border bg-surface p-4 shadow-sm transition-colors',
        row.isCurrent
          ? 'border-signal/50 ring-1 ring-signal/30'
          : 'border-border',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted">
            Week
          </span>
          <span className="font-mono text-2xl font-semibold leading-none tabular-nums text-foreground">
            {row.week}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {row.isCurrent ? (
            <Badge variant="signal" className="gap-1">
              <ArrowRight aria-hidden />
              Current
            </Badge>
          ) : null}
          {row.isCalibration ? (
            <Badge variant="warning" className="gap-1">
              <Crosshair aria-hidden />
              Calibration
            </Badge>
          ) : null}
          {row.isDeload ? (
            <Badge variant="warning" className="gap-1">
              <BatteryLow aria-hidden />
              Deload
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">Sessions</span>
          <span
            className={cn(
              'font-mono tabular-nums',
              complete ? 'text-gate-green' : 'text-foreground',
            )}
          >
            {row.doneCount}/{row.plannedCount}
          </span>
        </div>
        <Progress
          value={pct}
          aria-label={`${row.doneCount} of ${row.plannedCount} sessions done`}
        />
      </div>

      <ul className="flex flex-col gap-1.5">
        {row.days.map((day) => {
          const meta = statusMeta[day.status]
          const Icon = meta.Icon
          return (
            <li
              key={day.dayId}
              className={cn(
                'flex min-h-11 items-center gap-2 rounded-md border px-2.5 text-sm',
                meta.tone,
              )}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="truncate font-medium text-foreground">
                {day.label}
              </span>
              <span className="ml-auto text-xs font-medium">{meta.label}</span>
            </li>
          )
        })}
        {row.days.length === 0 ? (
          <li className="flex min-h-11 items-center rounded-md border border-border bg-background px-2.5 text-sm text-muted">
            No training days
          </li>
        ) : null}
      </ul>

      {row.isCurrent ? (
        <Link
          href="/today"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-signal px-4 text-sm font-semibold text-signal-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          Go to today
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      ) : null}
    </div>
  )
}

export function WeekGrid({ weeks }: { weeks: WeekRow[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {weeks.map((row) => (
        <WeekCard key={row.week} row={row} />
      ))}
    </div>
  )
}
