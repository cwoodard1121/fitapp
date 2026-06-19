import Link from 'next/link'
import { Check } from 'lucide-react'

import type { ProgramDay, SessionStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

interface DaySelectorProps {
  days: ProgramDay[]
  selectedDayId: string
  statusByDay: Record<string, SessionStatus>
}

/**
 * Horizontal day picker across the program's training days. Each chip links to
 * the same route with `?day=<id>`; the server re-renders for the chosen day.
 */
export function DaySelector({
  days,
  selectedDayId,
  statusByDay,
}: DaySelectorProps) {
  return (
    <nav
      aria-label="Training day"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {days.map((day) => {
        const active = day.id === selectedDayId
        const status = statusByDay[day.id]
        const done = status === 'done'
        const started = status === 'in_progress'
        return (
          <Link
            key={day.id}
            href={`/today?day=${day.id}`}
            scroll={false}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-11 shrink-0 flex-col justify-center rounded-md border px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              active
                ? 'border-signal bg-signal/10'
                : 'border-border bg-surface hover:bg-border/50',
            )}
          >
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  'font-mono text-xs',
                  active ? 'text-signal' : 'text-muted',
                )}
              >
                Day {day.day_number}
              </span>
              {done ? (
                <Check className="size-3 text-gate-green" aria-label="done" />
              ) : started ? (
                <span
                  className="size-1.5 rounded-full bg-gate-yellow"
                  aria-label="in progress"
                />
              ) : null}
            </span>
            <span
              className={cn(
                'whitespace-nowrap text-sm font-medium',
                active ? 'text-foreground' : 'text-foreground/80',
              )}
            >
              {day.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
