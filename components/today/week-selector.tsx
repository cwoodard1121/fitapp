'use client'

import Link from 'next/link'

import { cn } from '@/lib/utils'
import { setLastSelectedWeek } from '@/app/(app)/today/actions'

interface WeekSelectorProps {
  lengthWeeks: number
  selectedWeek: number
  currentWeek: number
}

/** Fire-and-forget: never awaited, never blocks the click's own navigation. */
function rememberWeek(week: number | null) {
  void setLastSelectedWeek({ week })
}

/**
 * Switches the logger between weeks of the mesocycle, timetable-style: one
 * cell per week, the current week marked with a dot. Changing weeks clears
 * the day so the destination opens its first unfinished workout; the pick
 * sticks across visits until "back to current" clears it.
 */
export function WeekSelector({
  lengthWeeks,
  selectedWeek,
  currentWeek,
}: WeekSelectorProps) {
  const weeks = Array.from(
    { length: Math.max(1, lengthWeeks) },
    (_, index) => index + 1,
  )
  return (
    <div className="flex items-center gap-3">
      <nav
        aria-label="Training week"
        className="no-scrollbar -my-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-1"
      >
        {weeks.map((week) => {
          const active = week === selectedWeek
          const current = week === currentWeek
          const href = current ? '/today' : `/today?week=${week}`
          return (
            <Link
              key={week}
              href={href}
              scroll={false}
              onClick={() => rememberWeek(current ? null : week)}
              aria-current={active ? 'page' : undefined}
              aria-label={`Week ${week}${current ? ', current week' : ''}`}
              className={cn(
                'relative flex h-11 min-w-11 shrink-0 select-none flex-col items-center justify-center rounded-md font-mono text-[0.9375rem] font-bold transition-[background-color,color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95',
                active
                  ? 'bg-foreground text-background'
                  : 'bg-surface text-foreground hover:bg-surface-2',
              )}
            >
              <span className="leading-none">
                <span className="text-[0.6875rem] font-semibold opacity-60">w</span>
                {week}
              </span>
              {current ? (
                <span
                  aria-hidden
                  className={cn(
                    'absolute bottom-1.5 size-1 rounded-full',
                    active ? 'bg-background' : 'bg-signal',
                  )}
                />
              ) : null}
            </Link>
          )
        })}
      </nav>
      {selectedWeek !== currentWeek ? (
        <Link
          href="/today"
          scroll={false}
          onClick={() => rememberWeek(null)}
          className="inline-flex h-11 shrink-0 items-center rounded-md px-2 text-sm font-semibold text-signal hover:underline"
        >
          back to w{currentWeek}
        </Link>
      ) : null}
    </div>
  )
}
