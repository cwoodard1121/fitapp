"use client"

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { RotateCw } from "lucide-react"

import { cn } from "@/lib/utils"

const TRIGGER = 72
const MAX = 110

/**
 * The app's one scroll region, with native-style pull-to-refresh: drag down
 * from the top and release past the threshold to re-fetch the route's data
 * (an installed PWA has no browser reload gesture of its own).
 */
export function PullToRefresh({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  const router = useRouter()
  const ref = useRef<HTMLElement>(null)
  const [pull, setPull] = useState(0)
  const [refreshing, startRefresh] = useTransition()
  const startY = useRef<number | null>(null)
  const pullRef = useRef(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    function onStart(e: TouchEvent) {
      if (el!.scrollTop > 0 || e.touches.length !== 1) {
        startY.current = null
        return
      }
      startY.current = e.touches[0].clientY
    }

    function onMove(e: TouchEvent) {
      if (startY.current == null) return
      const dy = e.touches[0].clientY - startY.current
      if (dy <= 0 || el!.scrollTop > 0) {
        if (pullRef.current !== 0) {
          pullRef.current = 0
          setPull(0)
        }
        return
      }
      // Resistance curve: easy at first, stiff near the end.
      const next = Math.min(MAX, dy * 0.5)
      pullRef.current = next
      setPull(next)
    }

    function onEnd() {
      if (startY.current == null) return
      startY.current = null
      const fired = pullRef.current >= TRIGGER
      pullRef.current = 0
      setPull(0)
      if (fired) {
        if (navigator.vibrate) navigator.vibrate(8)
        startRefresh(() => router.refresh())
      }
    }

    el.addEventListener("touchstart", onStart, { passive: true })
    el.addEventListener("touchmove", onMove, { passive: true })
    el.addEventListener("touchend", onEnd, { passive: true })
    el.addEventListener("touchcancel", onEnd, { passive: true })
    return () => {
      el.removeEventListener("touchstart", onStart)
      el.removeEventListener("touchmove", onMove)
      el.removeEventListener("touchend", onEnd)
      el.removeEventListener("touchcancel", onEnd)
    }
  }, [router])

  const visible = pull > 6 || refreshing
  const progress = Math.min(1, pull / TRIGGER)

  return (
    <main ref={ref} className={cn("relative", className)}>
      <div
        aria-hidden={!refreshing}
        role={refreshing ? "status" : undefined}
        className={cn(
          "pointer-events-none sticky top-0 z-20 flex h-0 justify-center transition-opacity duration-150",
          visible ? "opacity-100" : "opacity-0",
        )}
      >
        <span
          className={cn(
            "mt-3 inline-flex size-9 items-center justify-center rounded-full border border-border bg-surface text-foreground shadow-[0_4px_12px_rgb(var(--text-rgb)/0.12)]",
            progress >= 1 && !refreshing && "border-transparent bg-signal text-signal-foreground",
          )}
          style={{
            transform: refreshing
              ? "translateY(4px)"
              : `translateY(${Math.max(0, pull - 40)}px)`,
          }}
        >
          <RotateCw
            className={cn("size-[1.125rem]", refreshing && "animate-spin")}
            style={refreshing ? undefined : { transform: `rotate(${progress * 270}deg)` }}
            aria-hidden
          />
          {refreshing ? <span className="sr-only">Refreshing</span> : null}
        </span>
      </div>
      {children}
    </main>
  )
}
