import * as React from "react"
import {
  ArrowDown,
  ArrowUp,
  Ban,
  BatteryLow,
  Crosshair,
  Minus,
  Plus,
  PlusSquare,
  type LucideIcon,
} from "lucide-react"

import type { Decision } from "@/lib/engine/engine"
import { cn } from "@/lib/utils"

type DecisionTone = "signal" | "red" | "yellow" | "muted"

interface DecisionMeta {
  tone: DecisionTone
  Icon: LucideIcon
  /** Fallback display text when no engine `label` is passed. */
  fallbackLabel: string
}

/**
 * Maps the engine Decision to its panel colour + icon.
 *  - adds                     -> signal (the one accent)
 *  - Hold/reduce, Skip        -> gate-red
 *  - Deload, Calibrate        -> gate-yellow
 *  - Maintain, null           -> muted
 */
function decisionMeta(decision: Decision): DecisionMeta {
  switch (decision) {
    case "Add 5 lb":
      return { tone: "signal", Icon: Plus, fallbackLabel: "Add 5 lb" }
    case "Add 1 rep":
      return { tone: "signal", Icon: ArrowUp, fallbackLabel: "Add 1 rep" }
    case "Add 2 reps":
      return { tone: "signal", Icon: ArrowUp, fallbackLabel: "Add 2 reps" }
    case "Add 1 set":
      return { tone: "signal", Icon: PlusSquare, fallbackLabel: "Add 1 set" }
    case "Hold/reduce":
      return { tone: "red", Icon: ArrowDown, fallbackLabel: "Hold / reduce" }
    case "Skip":
      return { tone: "red", Icon: Ban, fallbackLabel: "Skip" }
    case "Deload / maintain":
      return {
        tone: "yellow",
        Icon: BatteryLow,
        fallbackLabel: "Deload / maintain",
      }
    case "Calibrate (set baseline)":
      return { tone: "yellow", Icon: Crosshair, fallbackLabel: "Calibrate" }
    case "Maintain":
      return { tone: "muted", Icon: Minus, fallbackLabel: "Maintain" }
    case null:
    default:
      return { tone: "muted", Icon: Minus, fallbackLabel: "—" }
  }
}

const toneClasses: Record<DecisionTone, string> = {
  signal: "border-transparent bg-gate-green/10 text-gate-green",
  red: "border-transparent bg-gate-red/10 text-gate-red",
  yellow: "border-transparent bg-gate-yellow/15 text-gate-yellow",
  muted: "border-transparent bg-surface-2 text-muted",
}

type DecisionBadgeSize = "sm" | "default" | "lg"

const sizeClasses: Record<DecisionBadgeSize, string> = {
  sm: "gap-1 px-2 py-1 text-xs [&_svg]:size-3",
  default: "gap-1.5 px-2.5 py-1.5 text-sm [&_svg]:size-4",
  lg: "gap-2 px-3 py-2 text-base [&_svg]:size-5",
}

export interface DecisionBadgeProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  decision: Decision
  /**
   * Engine `decisionLabel` (e.g. "Add 10 lb" with the real increment / unit).
   * Falls back to a sensible label derived from the decision.
   */
  label?: string
  /** Optional one-line "why", rendered quiet beneath the pill. */
  reason?: string
  size?: DecisionBadgeSize
  showIcon?: boolean
}

/**
 * DecisionBadge — renders an engine Decision in its panel colour with an
 * icon. The signature call-out: adds glow in `signal`, gates use their
 * colours, maintain/null stay quiet. Pass `reason` to show the one-liner.
 */
const DecisionBadge = React.forwardRef<HTMLSpanElement, DecisionBadgeProps>(
  (
    { decision, label, reason, size = "default", showIcon = true, className, ...props },
    ref
  ) => {
    const { tone, Icon, fallbackLabel } = decisionMeta(decision)
    const text = label ?? fallbackLabel
    const ariaLabel = reason ? `${text}. ${reason}` : text

    const pill = (
      <span
        className={cn(
          "inline-flex items-center whitespace-nowrap rounded-sm border font-semibold leading-none",
          toneClasses[tone],
          sizeClasses[size]
        )}
      >
        {showIcon ? <Icon aria-hidden="true" /> : null}
        <span>{text}</span>
      </span>
    )

    if (!reason) {
      return (
        <span
          ref={ref}
          role="status"
          aria-label={ariaLabel}
          className={cn("inline-flex", className)}
          {...props}
        >
          {pill}
        </span>
      )
    }

    return (
      <span
        ref={ref}
        role="status"
        aria-label={ariaLabel}
        className={cn("inline-flex flex-col items-start gap-1", className)}
        {...props}
      >
        {pill}
        <span className="text-xs leading-snug text-muted">{reason}</span>
      </span>
    )
  }
)
DecisionBadge.displayName = "DecisionBadge"

export { DecisionBadge, decisionMeta }
