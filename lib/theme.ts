/**
 * Chart palette as CSS custom-property references, so SVG charts (Recharts
 * accepts `var()` in fill/stroke) follow the light/dark tokens in
 * app/globals.css without a second source of truth.
 */
export const CHART = {
  signal: "var(--signal)",
  muted: "var(--muted)",
  border: "var(--border)",
  grid: "var(--border)",
  surface: "var(--surface)",
  text: "var(--text)",
  yellow: "var(--gate-yellow)",
  green: "var(--gate-green)",
  red: "var(--gate-red)",
  second: "var(--chart-2)",
  third: "var(--chart-3)",
} as const

export const CHART_FONT = "var(--font-archivo), system-ui, sans-serif"

/**
 * Canvas can't read `var()`, so resolve a token's RGB channels at draw time.
 * Returns an `rgb(r g b / a)` string.
 */
export function canvasColor(token: string, alpha = 1): string {
  if (typeof window === "undefined") return `rgb(0 0 0 / ${alpha})`
  const channels = getComputedStyle(document.documentElement)
    .getPropertyValue(`--${token}-rgb`)
    .trim()
  const a = Math.max(0, Math.min(1, alpha))
  return channels ? `rgb(${channels} / ${a})` : `rgb(0 0 0 / ${a})`
}
