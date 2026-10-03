import { format, parseISO } from "date-fns"
import { CHART } from "@/lib/theme"

/**
 * Shared visual language for "Wrapped"-style celebratory recaps — the block
 * recap (components/blocks/block-wrapped-recap.tsx) and the session recap
 * (components/today/session-wrapped-recap.tsx) both import from here so a
 * bigger, rarer recap and a quick, frequent one still read as one design
 * system: same accent color, same big mono numerals, same metric shapes.
 */
export const WRAPPED_COLORS = {
  signal: CHART.signal,
  muted: CHART.muted,
  border: CHART.border,
  surface: CHART.surface,
  bodyfat: CHART.second,
} as const

export function wrappedGrouped(value: number): string {
  return Math.round(value).toLocaleString()
}

export function wrappedValue(value: number | null, precision = 1): string {
  return value == null ? "—" : value.toFixed(precision)
}

export function wrappedSigned(value: number | null, unit: string, precision = 1): string {
  if (value == null) return "—"
  const prefix = value > 0 ? "+" : ""
  return `${prefix}${value.toFixed(precision)} ${unit}`
}

export function wrappedShortDate(iso: string): string {
  try {
    return format(parseISO(iso), "MMM d")
  } catch {
    return iso.slice(5, 10)
  }
}

/** The big hero-style figure used for a recap's headline stats. */
export function WrappedStoryMetric({
  label,
  display,
}: {
  label: string
  display: string
}) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-foreground sm:text-3xl">
        {display}
      </p>
      <p className="mt-0.5 text-xs text-muted">{label}</p>
    </div>
  )
}

/** A smaller, left-rule figure for secondary stats in a recap's detail grid. */
export function WrappedDetailMetric({ label, display }: { label: string; display: string }) {
  return (
    <div className="border-l border-border pl-3">
      <p className="font-mono text-base font-semibold tabular-nums text-foreground">
        {display}
      </p>
      <p className="mt-0.5 text-[11px] leading-tight text-muted">{label}</p>
    </div>
  )
}
