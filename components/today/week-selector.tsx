'use client'

import Link from 'next/link'

import { cn, TAP_SCALE } from '@/lib/utils'
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
 * Switches the session logger between weeks in the current mesocycle. Changing
 * weeks deliberately clears the selected day so the destination week can open
 * its first unfinished workout. The pick also sticks across visits (see
 * rememberWeek) until "Back to current" clears it.
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
    <section aria-labelledby="training-week-label">
      <div className="mb-2 flex min-h-5 items-center justify-between gap-3">
        <p
          id="training-week-label"
          className="font-mono text-xs uppercase tracking-[0.18em] text-muted"
        >
          Training week
        </p>
        {selectedWeek !== currentWeek ? (
          <Link
            href="/today"
            scroll={false}
            onClick={() => rememberWeek(null)}
            className="text-xs font-medium text-signal hover:underline"
          >
            Back to current
          </Link>
        ) : (
          <span className="text-xs text-muted">Current week</span>
        )}
      </div>

      <nav
        aria-label="Training week"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                'flex h-11 min-w-16 shrink-0 items-center justify-center gap-1.5 rounded-md border px-3 font-mono text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                TAP_SCALE,
                active
                  ? 'border-signal bg-signal/10 text-signal'
                  : 'border-border bg-surface text-foreground hover:bg-border/50',
              )}
            >
              W{week}
              {current ? (
                <span
                  className="size-1.5 rounded-full bg-signal"
                  aria-hidden
                />
              ) : null}
            </Link>
          )
        })}
      </nav>
    </section>
  )
}
