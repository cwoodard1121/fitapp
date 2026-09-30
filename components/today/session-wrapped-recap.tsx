"use client"

import * as React from "react"
import { Trophy } from "lucide-react"

import type { SessionRecapData } from "@/app/(app)/today/actions"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { AnimatedNumber } from "@/components/ui/animated-number"
import { TAP_SCALE } from "@/lib/utils"
import {
  WRAPPED_COLORS as COLORS,
  WrappedStoryMetric as StoryMetric,
  wrappedGrouped as grouped,
} from "@/components/ui/wrapped-recap"

/**
 * Session-scale sibling of the block "Wrapped" recap (components/blocks/
 * block-wrapped-recap.tsx) — same gradient-header, signal-green, big-mono-
 * numeral visual language via components/ui/wrapped-recap.tsx, but a single
 * quick screen instead of a multi-section report: this fires every session,
 * the block one maybe once a month.
 */
export function SessionWrappedRecap({
  open,
  onOpenChange,
  data,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: SessionRecapData
}) {
  // Mount the hero number at 0 and bump it to the real value one tick after
  // the dialog settles in, so AnimatedNumber has something to count up from
  // instead of popping straight to the final tonnage (it shows the target
  // immediately on first paint otherwise — see its own doc comment).
  const [revealed, setRevealed] = React.useState(false)
  React.useEffect(() => {
    if (!open) {
      setRevealed(false)
      return
    }
    const id = window.setTimeout(() => setRevealed(true), 150)
    return () => window.clearTimeout(id)
  }, [open])

  const hasPRs = data.prs.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg overflow-hidden p-0">
        <div className="relative overflow-hidden border-b border-border px-5 pb-6 pt-7 sm:px-7">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-60 [background:radial-gradient(circle_at_75%_10%,rgba(199,242,74,0.12),transparent_34%),linear-gradient(135deg,transparent_58%,rgba(199,242,74,0.04)_58%,rgba(199,242,74,0.04)_61%,transparent_61%)]"
          />
          <div className="relative">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-signal">
              Session complete
            </p>
            <DialogTitle className="mt-2 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
              {data.dayLabel}
            </DialogTitle>
            <DialogDescription className="sr-only">
              A recap of the workout you just finished.
            </DialogDescription>

            <div className="mt-6 flex items-baseline gap-2 font-mono font-semibold tabular-nums tracking-tight text-foreground">
              <span className="text-5xl sm:text-6xl">
                <AnimatedNumber value={revealed ? data.totalTonnage : 0} durationMs={900} />
              </span>
              <span className="text-base font-normal text-muted">{data.unit} moved</span>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3">
              <StoryMetric label="lifts logged" display={grouped(data.loggedCount)} />
              <StoryMetric label="sets" display={grouped(data.totalSets)} />
              <StoryMetric label="reps" display={grouped(data.totalReps)} />
            </div>
          </div>
        </div>

        {hasPRs ? (
          <div className="space-y-2.5 px-5 py-5 sm:px-7">
            <div className="flex items-center gap-2 text-signal">
              <Trophy className="size-4" aria-hidden />
              <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.16em]">
                New {data.prs.length === 1 ? "PR" : "PRs"}
              </h3>
            </div>
            <ul className="space-y-1.5">
              {data.prs.map((pr) => (
                <li
                  key={pr.exerciseName}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                  style={{ borderColor: COLORS.border }}
                >
                  <span className="truncate text-sm font-medium text-foreground">
                    {pr.exerciseName}
                  </span>
                  <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-signal">
                    {pr.e1rm} {data.unit} e1RM
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="border-t border-border px-5 py-4 sm:px-7">
          <Button
            size="lg"
            className={`w-full ${TAP_SCALE}`}
            onClick={() => onOpenChange(false)}
          >
            Nice
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
