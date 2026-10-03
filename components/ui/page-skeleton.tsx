import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * Shared building blocks for route `loading.tsx` files. Next renders these
 * instantly on navigation (before the server component's data has resolved),
 * which is what makes a tap feel immediate instead of "frozen" — the single
 * biggest lever for perceived speed on a data-heavy, force-dynamic app like
 * this one. Every page composes the same few primitives instead of hand
 * rolling its own pulse blocks, so a route's loading state stays a one-line
 * change instead of a bespoke layout to maintain.
 */

const maxWidths = {
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '5xl': 'max-w-5xl',
} as const

export function SkeletonPage({
  maxWidth = '2xl',
  className,
  children,
}: {
  maxWidth?: keyof typeof maxWidths
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-4 pb-10 pt-4 sm:pt-6',
        maxWidths[maxWidth],
        className,
      )}
      // Screen readers get silence, not a wall of "loading" pulses.
      aria-hidden
    >
      {children}
    </div>
  )
}

/** Title + subtitle, matching every page's header shape. */
export function SkeletonHeaderBar({ withAction = false }: { withAction?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Skeleton className="h-8 w-48" />
      {withAction ? <Skeleton className="h-10 w-28 rounded-md" /> : null}
    </div>
  )
}

/** A generic card-shaped pulse block — the workhorse for most page bodies. */
export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <Skeleton
      className={cn('rounded-lg border border-border bg-surface', className)}
    />
  )
}

/** A horizontally-scrolling chip row, e.g. the week/day strips. */
export function SkeletonChips({ count = 6 }: { count?: number }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-14 w-24 shrink-0 rounded-md bg-surface" />
      ))}
    </div>
  )
}

/** A single list/table row (history, entries, recent-days lists). */
export function SkeletonRow({ className }: { className?: string }) {
  return (
    <Skeleton className={cn('h-16 w-full rounded-md bg-surface', className)} />
  )
}
