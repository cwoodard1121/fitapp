'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/** Loosely typed — TS's DOM lib coverage for this API varies by version. */
type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => Promise<void>) => { skipTransition?: () => void }
}

/**
 * A thin top-of-screen progress bar for in-app navigation — the native-app
 * cue that something is happening the instant you tap, instead of a frozen
 * screen until the next route's data resolves. Next.js App Router doesn't
 * expose a global "navigation pending" event, so this infers it: start on the
 * next internal link click or back/forward, finish when the URL (path or
 * query) actually changes, with a timeout fallback so a same-route click or a
 * navigation that gets cancelled never leaves the bar stuck mid-way.
 *
 * Also wraps that same window in the standard View Transitions API when the
 * browser supports it (Chrome/Edge/Safari — a plain instant swap everywhere
 * else, including Firefox), so a navigation cross-fades as one continuous
 * surface instead of a hard cut. This is done by hand with the stable
 * `document.startViewTransition` API rather than Next's
 * experimental.viewTransition flag, which requires an unstable React build —
 * see next.config.ts.
 */
export function RouteProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resolveTransitionRef = useRef<(() => void) | null>(null)
  const key = `${pathname}?${searchParams.toString()}`
  const prevKeyRef = useRef(key)

  // The URL actually changed -> the pending navigation landed. Finish the bar
  // and let the view transition (if one is pending) snapshot the new state.
  useEffect(() => {
    if (prevKeyRef.current === key) return
    prevKeyRef.current = key
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    resolveTransitionRef.current?.()
    resolveTransitionRef.current = null
    setState('done')
    const t = setTimeout(() => setState('idle'), 200)
    return () => clearTimeout(t)
  }, [key])

  useEffect(() => {
    function shouldStart(anchor: HTMLAnchorElement): boolean {
      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#')) return false
      if (anchor.target && anchor.target !== '_self') return false
      if (anchor.hasAttribute('download')) return false
      if (anchor.origin !== window.location.origin) return false
      // Same URL (including query) -> nothing will actually navigate.
      if (anchor.href === window.location.href) return false
      return true
    }

    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = (e.target as HTMLElement | null)?.closest('a')
      if (!anchor || !shouldStart(anchor)) return
      start()
    }

    function onPopState() {
      start()
    }

    function start() {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      // A prior transition never resolved (e.g. a second click landed before
      // the first navigation finished) — release it before starting a new
      // one so the browser never sits frozen on an old snapshot.
      resolveTransitionRef.current?.()
      resolveTransitionRef.current = null

      const doc = document as ViewTransitionDocument
      if (typeof doc.startViewTransition === 'function') {
        try {
          doc.startViewTransition(
            () =>
              new Promise<void>((resolve) => {
                resolveTransitionRef.current = resolve
              }),
          )
        } catch {
          // Never let an unsupported/odd browser implementation block nav.
          resolveTransitionRef.current = null
        }
      }

      setState('loading')
      // Fallback: same-route navigations or a cancelled transition never fire
      // the URL-change effect above, so force-clear (and release any pending
      // view transition) after a beat.
      timeoutRef.current = setTimeout(() => {
        resolveTransitionRef.current?.()
        resolveTransitionRef.current = null
        setState('idle')
      }, 4000)
    }

    document.addEventListener('click', onClick, { capture: true })
    window.addEventListener('popstate', onPopState)
    return () => {
      document.removeEventListener('click', onClick, { capture: true })
      window.removeEventListener('popstate', onPopState)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  if (state === 'idle') return null

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 bg-transparent"
    >
      <div
        className="h-full bg-signal motion-reduce:transition-none"
        style={{
          width: state === 'done' ? '100%' : '78%',
          opacity: state === 'done' ? 0 : 1,
          transition:
            state === 'done'
              ? 'width 150ms ease-out, opacity 250ms ease-in 100ms'
              : 'width 3.5s cubic-bezier(0.15, 0.8, 0.35, 1), opacity 150ms ease-out',
        }}
      />
    </div>
  )
}
