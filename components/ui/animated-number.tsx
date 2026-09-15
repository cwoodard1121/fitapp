'use client'

import * as React from 'react'

/**
 * Tweens the displayed digits from the previous value to the next one instead
 * of popping straight to it — the "instrument panel" reading like it's live
 * rather than a static label. Used opt-in inside `Stat` (see `animated`).
 * Snaps instantly for `prefers-reduced-motion` and on first mount (nothing to
 * animate from yet).
 */
export function AnimatedNumber({
  value,
  precision,
  durationMs = 650,
}: {
  value: number
  precision?: number
  durationMs?: number
}) {
  const [display, setDisplay] = React.useState(value)
  const fromRef = React.useRef(value)
  const rafRef = React.useRef<number | null>(null)
  const mountedOnce = React.useRef(false)

  React.useEffect(() => {
    // First paint: show the real value immediately, nothing to tween from.
    if (!mountedOnce.current) {
      mountedOnce.current = true
      fromRef.current = value
      setDisplay(value)
      return
    }
    if (value === fromRef.current) return

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) {
      fromRef.current = value
      setDisplay(value)
      return
    }

    const from = fromRef.current
    const to = value
    const start = performance.now()
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      // Ease-out-cubic: fast start, settles gently — reads as a live readout
      // ticking to rest, not a linear slide.
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(from + (to - from) * eased)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = to
        setDisplay(to)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [value, durationMs])

  return <>{precision !== undefined ? display.toFixed(precision) : Math.round(display)}</>
}
