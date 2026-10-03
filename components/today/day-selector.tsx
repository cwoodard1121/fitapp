import Link from 'next/link'
import { Check } from 'lucide-react'

import type { ProgramDay, SessionStatus } from '@/lib/types'
import { cn, dayName } from '@/lib/utils'

interface DaySelectorProps {
  days: ProgramDay[]
  selectedDayId: string
  statusByDay: Record<string, SessionStatus>
  weekOverride?: number
}

/**
 * Horizontal day picker across the program's training days. The selected day
 * takes the venue's field colour. A manually selected week stays pinned while
 * calendar-current mode omits it so the URL can roll forward with time.
 */
export function DaySelector({
  days,
  selectedDayId,
  statusByDay,
  weekOverride,
}: DaySelectorProps) {
  return (
    <nav
      aria-label="Training day"
      className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 py-1"
    >
      {days.map((day) => {
        const active = day.id === selectedDayId
        const status = statusByDay[day.id]
        const done = status === 'done'
        const started = status === 'in_progress'
        const weekQuery = weekOverride == null ? '' : `week=${weekOverride}&`
        return (
          <Link
            key={day.id}
            href={`/today?${weekQuery}day=${day.id}`}
            scroll={false}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-14 min-w-[5.5rem] shrink-0 snap-start select-none flex-col justify-center gap-1 rounded-md px-3.5 py-2 transition-[background-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97]',
              active
                ? 'bg-hue-today text-on-hue'
                : 'bg-surface text-foreground hover:bg-surface-2',
            )}
          >
            <span className="flex items-center gap-1.5 text-xs font-semibold leading-none">
              <span className={active ? 'opacity-75' : 'text-muted'}>
                day {day.day_number}
              </span>
              {done ? (
                <Check
                  className={cn('size-3.5', active ? 'text-on-hue' : 'text-gate-green')}
                  strokeWidth={3}
                  aria-label="done"
                />
              ) : started ? (
                <span
                  className={cn('size-1.5 rounded-full', active ? 'bg-on-hue' : 'bg-signal')}
                  aria-label="in progress"
                />
              ) : null}
            </span>
            <span className="whitespace-nowrap text-[0.9375rem] font-bold lowercase leading-none">
              {dayName(day.label)}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
