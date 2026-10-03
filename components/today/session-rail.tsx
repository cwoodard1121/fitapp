'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'
import { onSlotProgress } from '@/lib/client/slot-progress'

export interface RailSegment {
  slotId: string
  code: string
  name: string
  logged: boolean
}

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * The live session rail: one segment per exercise slot. Segments sweep full
 * the moment a rep is typed, the slot on screen is marked as you scroll, and
 * once the rail scrolls away a docked copy rides under the venue band so the
 * session's shape is always one glance and one tap away.
 */
export function SessionRail({
  segments,
  done,
}: {
  segments: RailSegment[]
  done: boolean
}) {
  const bandRef = React.useRef<HTMLElement>(null)
  const [live, setLive] = React.useState<Record<string, boolean>>({})
  const [active, setActive] = React.useState<string | null>(null)
  const [docked, setDocked] = React.useState(false)
  const idsKey = segments.map((s) => s.slotId).join('|')

  // Optimistic fill straight from the set grid, ahead of the server refresh.
  React.useEffect(
    () =>
      onSlotProgress(({ slotId, performedSets }) => {
        const logged = performedSets > 0
        setLive((prev) =>
          prev[slotId] === logged ? prev : { ...prev, [slotId]: logged },
        )
      }),
    [],
  )

  const isLogged = (s: RailSegment) => live[s.slotId] ?? s.logged
  const loggedCount = segments.filter(isLogged).length

  // A short tick on Android when an exercise gets its first set.
  const lastCount = React.useRef(loggedCount)
  React.useEffect(() => {
    if (loggedCount > lastCount.current) navigator.vibrate?.(10)
    lastCount.current = loggedCount
  }, [loggedCount])

  // Dock once the in-flow rail has scrolled up out of view.
  React.useEffect(() => {
    const el = bandRef.current
    if (!el) return
    const root = el.closest('main')
    const io = new IntersectionObserver(
      ([entry]) => {
        const rootTop = entry.rootBounds?.top ?? 0
        setDocked(!entry.isIntersecting && entry.boundingClientRect.top < rootTop)
      },
      { root, threshold: 0 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Scroll-spy: the slot crossing the upper third of the screen is "current".
  React.useEffect(() => {
    const root = bandRef.current?.closest('main') ?? null
    const ids = idsKey.split('|').filter(Boolean)
    const visible = new Set<string>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id.replace(/^slot-/, '')
          if (entry.isIntersecting) visible.add(id)
          else visible.delete(id)
        }
        setActive(ids.find((id) => visible.has(id)) ?? null)
      },
      { root, rootMargin: '-25% 0px -65% 0px', threshold: 0 },
    )
    for (const id of ids) {
      const article = document.getElementById(`slot-${id}`)
      if (article) io.observe(article)
    }
    return () => io.disconnect()
  }, [idsKey])

  const jump = React.useCallback((slotId: string) => {
    const target = document.getElementById(`slot-${slotId}`)
    if (!target) return
    target.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    })
  }, [])

  if (segments.length === 0) return null

  const band = (variant: 'inline' | 'docked') => (
    <ol className="flex gap-1">
      {segments.map((s) => {
        const logged = isLogged(s)
        const current = active === s.slotId
        return (
          <li key={s.slotId} className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => jump(s.slotId)}
              tabIndex={variant === 'docked' && !docked ? -1 : undefined}
              aria-current={current ? 'step' : undefined}
              aria-label={`${s.code}, ${s.name}${logged ? ', logged' : ''}`}
              className="group flex h-12 w-full select-none flex-col justify-start gap-1.5 rounded-sm pt-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            >
              <span
                aria-hidden
                className={cn(
                  'relative block h-3.5 w-full overflow-hidden rounded-[3px] transition-shadow duration-200',
                  done ? 'bg-gate-green/25' : 'bg-hue-today/25',
                  current && 'shadow-[0_0_0_2px_rgb(var(--text-rgb))]',
                )}
              >
                <span
                  className={cn(
                    'absolute inset-0 origin-left transition-transform duration-300 ease-out motion-reduce:transition-none',
                    done ? 'bg-gate-green' : 'bg-hue-today',
                    logged ? 'scale-x-100' : 'scale-x-0',
                  )}
                />
              </span>
              <span
                className={cn(
                  'truncate text-center font-mono text-[0.6875rem] font-bold leading-none transition-colors',
                  current || logged ? 'text-foreground' : 'text-muted',
                )}
              >
                {s.code}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )

  // The sticky anchor must be a direct child of the page column (which runs
  // the full length of the session), or it scrolls away with its parent.
  return (
    <>
      {/* Docked copy: zero-height sticky anchor, bar slides down from it. */}
      <div className="sticky top-0 z-20 -mx-4 h-0" aria-hidden={!docked}>
        <div
          className={cn(
            'absolute inset-x-0 top-0 border-b border-border bg-surface/95 px-4 pb-1 pt-1.5 backdrop-blur-md transition-[transform,opacity,visibility,box-shadow] duration-200 ease-out supports-[backdrop-filter]:bg-surface/85 motion-reduce:transition-none',
            // Undocked, the anchor sits in flow just above the rail, so the
            // copy must be invisible there, not merely shifted up.
            docked
              ? 'visible translate-y-0 opacity-100 shadow-[0_6px_18px_rgb(var(--text-rgb)/0.08)]'
              : 'pointer-events-none invisible -translate-y-full opacity-0',
          )}
        >
          {band('docked')}
        </div>
      </div>

      <nav ref={bandRef} aria-label="Exercises in this session" className="mt-4">
        {band('inline')}
        <p className="sr-only" aria-live="polite">
          {loggedCount} of {segments.length} exercises logged
        </p>
      </nav>
    </>
  )
}
