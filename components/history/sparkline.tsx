import * as React from "react"

import { cn } from "@/lib/utils"

export interface SparklineProps
  extends Omit<React.SVGProps<SVGSVGElement>, "values"> {
  /** Series of values, oldest -> newest. Nulls are skipped. */
  values: Array<number | null | undefined>
  width?: number
  height?: number
}

/**
 * Sparkline — a tiny, quiet line of a metric's trajectory (e.g. e1RM across
 * sessions). No axes, no animation; it just shows shape. Renders nothing when
 * there are fewer than two real points to connect.
 */
export function Sparkline({
  values,
  width = 64,
  height = 20,
  className,
  ...props
}: SparklineProps) {
  const points = values.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v)
  )
  if (points.length < 2) return null

  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const stepX = width / (points.length - 1)

  const coords = points.map((v, i) => {
    const x = i * stepX
    // Pad 1px top/bottom so the stroke isn't clipped.
    const y = height - 1 - ((v - min) / span) * (height - 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const last = points[points.length - 1]
  const rising = last >= points[0]

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      className={cn("overflow-visible", className)}
      {...props}
    >
      <polyline
        points={coords.join(" ")}
        className={rising ? "stroke-signal" : "stroke-muted"}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={(points.length - 1) * stepX}
        cy={height - 1 - ((last - min) / span) * (height - 2)}
        r={1.8}
        className={rising ? "fill-signal" : "fill-muted"}
      />
    </svg>
  )
}
