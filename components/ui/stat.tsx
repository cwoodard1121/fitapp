import * as React from "react"

import { cn } from "@/lib/utils"

type StatTone =
  | "default"
  | "signal"
  | "muted"
  | "green"
  | "yellow"
  | "red"

type StatSize = "sm" | "default" | "lg" | "xl"

const toneClasses: Record<StatTone, string> = {
  default: "text-foreground",
  signal: "text-signal",
  muted: "text-muted",
  green: "text-gate-green",
  yellow: "text-gate-yellow",
  red: "text-gate-red",
}

const sizeClasses: Record<StatSize, string> = {
  sm: "text-base",
  default: "text-xl",
  lg: "text-3xl",
  xl: "text-5xl",
}

export interface StatProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  /** The figure to render. Numbers get tabular-nums + optional precision. */
  value: number | string | null | undefined
  /** Small caption above the figure (sans, uppercase). */
  label?: string
  /** Trailing unit, e.g. "lb", "reps", "%". Rendered quiet/muted. */
  unit?: string
  /** Decimal places when `value` is a number. Omit to print as-is. */
  precision?: number
  tone?: StatTone
  size?: StatSize
  /** Shown when value is null/undefined/non-finite. */
  placeholder?: string
  labelClassName?: string
  valueClassName?: string
  unitClassName?: string
}

function formatValue(
  value: StatProps["value"],
  precision: number | undefined,
  placeholder: string
): string {
  if (value === null || value === undefined || value === "") return placeholder
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return placeholder
    return precision !== undefined ? value.toFixed(precision) : String(value)
  }
  return value
}

/**
 * Stat — the app's mono "instrument readout". Renders a figure in tabular
 * mono so loads/reps/RIR/e1RM align like a panel gauge, with an optional
 * sans label and a quiet trailing unit.
 */
const Stat = React.forwardRef<HTMLDivElement, StatProps>(
  (
    {
      value,
      label,
      unit,
      precision,
      tone = "default",
      size = "default",
      placeholder = "—",
      className,
      labelClassName,
      valueClassName,
      unitClassName,
      ...props
    },
    ref
  ) => {
    const display = formatValue(value, precision, placeholder)
    const isPlaceholder = display === placeholder

    return (
      <div
        ref={ref}
        className={cn("inline-flex flex-col gap-0.5", className)}
        {...props}
      >
        {label ? (
          <span
            className={cn(
              "font-sans text-[11px] font-medium uppercase tracking-wider text-muted",
              labelClassName
            )}
          >
            {label}
          </span>
        ) : null}
        <span
          className={cn(
            "font-mono font-semibold leading-none tracking-tight tabular-nums",
            sizeClasses[size],
            isPlaceholder ? "text-muted" : toneClasses[tone],
            valueClassName
          )}
        >
          {display}
          {unit && !isPlaceholder ? (
            <span
              className={cn(
                "ml-1 align-baseline text-[0.6em] font-normal text-muted",
                unitClassName
              )}
            >
              {unit}
            </span>
          ) : null}
        </span>
      </div>
    )
  }
)
Stat.displayName = "Stat"

export { Stat }
