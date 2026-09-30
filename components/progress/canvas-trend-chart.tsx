"use client"

import * as React from "react"

import type { ExercisePoint } from "./types"
import { chartColors, fmtDate, fmtNum, PanelTooltip } from "./charts"

const { SIGNAL, MUTED, GRID, SURFACE } = chartColors

interface Pt {
  date: string
  week: number
  value: number
  label: string
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/** "#rrggbb" + alpha -> "rgba(r, g, b, a)" — canvas has no CSS color-mix. */
function hexAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`
}

const HEIGHT = 200
const PAD = { top: 14, right: 10, bottom: 8, left: 10 }
const REVEAL_MS = 500
const MORPH_MS = 380

/**
 * Hand-drawn Canvas replacement for the Recharts e1RM/load trend area. Draws
 * the line in on mount (progressive left-to-right reveal) and cross-fades
 * between series when the focused exercise changes, instead of hard-swapping
 * the chart. Pointer/touch scrub shows the nearest point in a floating
 * PanelTooltip with a marker dot. Small dataset (weeks of lifts, not
 * millions of points) — plain 2D canvas, no virtualization/WebGL needed.
 */
export function CanvasTrendChart({
  points,
  dataKey,
  unit,
  label,
}: {
  points: ExercisePoint[]
  dataKey: "e1rm" | "load"
  unit: string
  label: string
}) {
  const data = React.useMemo<Pt[]>(
    () =>
      points
        .filter((p) => p[dataKey] != null)
        .map((p) => ({
          date: p.date,
          week: p.week,
          value: p[dataKey] as number,
          label: fmtDate(p.date),
        })),
    [points, dataKey]
  )

  const containerRef = React.useRef<HTMLDivElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const [widthCss, setWidthCss] = React.useState(0)
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null)

  const prevDataRef = React.useRef<Pt[] | null>(null)
  const mountedRef = React.useRef(false)
  const rafRef = React.useRef<number | null>(null)
  const progressRef = React.useRef(1)

  const reduceMotion = React.useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    []
  )

  // Responsive width.
  React.useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setWidthCss(w)
    })
    setWidthCss(el.clientWidth)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scales = React.useMemo(() => {
    if (data.length === 0 || widthCss === 0) return null
    const values = data.map((d) => d.value)
    let min = Math.min(...values)
    let max = Math.max(...values)
    if (min === max) {
      min -= 1
      max += 1
    } else {
      const pad = (max - min) * 0.12
      min -= pad
      max += pad
    }
    const innerW = Math.max(1, widthCss - PAD.left - PAD.right)
    const innerH = HEIGHT - PAD.top - PAD.bottom
    const xFor = (i: number) =>
      PAD.left + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW)
    const yFor = (v: number) => PAD.top + innerH - ((v - min) / (max - min)) * innerH
    return { min, max, xFor, yFor, innerW, innerH }
  }, [data, widthCss])
  const scalesRef = React.useRef(scales)
  scalesRef.current = scales

  const hoverIndexRef = React.useRef(hoverIndex)
  hoverIndexRef.current = hoverIndex

  const drawSeries = React.useCallback(
    (ctx: CanvasRenderingContext2D, series: Pt[], alpha: number, revealT: number) => {
      const sc = scalesRef.current
      if (!sc || series.length === 0 || alpha <= 0) return
      const revealX = PAD.left + sc.innerW * easeOutCubic(revealT)

      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, revealX, HEIGHT)
      ctx.clip()

      // Soft fill under the line.
      const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + sc.innerH)
      grad.addColorStop(0, hexAlpha(SIGNAL, 0.22 * alpha))
      grad.addColorStop(1, hexAlpha(SIGNAL, 0))
      ctx.fillStyle = grad
      ctx.beginPath()
      series.forEach((p, i) => {
        const x = sc.xFor(i)
        const y = sc.yFor(p.value)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.lineTo(sc.xFor(series.length - 1), PAD.top + sc.innerH)
      ctx.lineTo(sc.xFor(0), PAD.top + sc.innerH)
      ctx.closePath()
      ctx.fill()

      // Line.
      ctx.strokeStyle = hexAlpha(SIGNAL, alpha)
      ctx.lineWidth = 2
      ctx.lineJoin = "round"
      ctx.lineCap = "round"
      ctx.beginPath()
      series.forEach((p, i) => {
        const x = sc.xFor(i)
        const y = sc.yFor(p.value)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()

      // Point dots.
      series.forEach((p, i) => {
        const x = sc.xFor(i)
        const y = sc.yFor(p.value)
        ctx.beginPath()
        ctx.arc(x, y, 2.5, 0, Math.PI * 2)
        ctx.fillStyle = hexAlpha(SIGNAL, alpha)
        ctx.fill()
      })
      ctx.restore()
    },
    []
  )

  const draw = React.useCallback(
    (t: number) => {
      const canvas = canvasRef.current
      const sc = scalesRef.current
      if (!canvas || !sc || data.length === 0 || widthCss === 0) return
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1
      const wantW = Math.round(widthCss * dpr)
      const wantH = Math.round(HEIGHT * dpr)
      if (canvas.width !== wantW || canvas.height !== wantH) {
        canvas.width = wantW
        canvas.height = wantH
        canvas.style.width = `${widthCss}px`
        canvas.style.height = `${HEIGHT}px`
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, widthCss, HEIGHT)

      // Horizontal gridlines.
      ctx.strokeStyle = GRID
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      const bands = 3
      for (let i = 0; i <= bands; i++) {
        const y = Math.round(PAD.top + (sc.innerH / bands) * i) + 0.5
        ctx.beginPath()
        ctx.moveTo(PAD.left, y)
        ctx.lineTo(widthCss - PAD.right, y)
        ctx.stroke()
      }
      ctx.setLineDash([])

      const eased = easeOutCubic(t)
      const prev = prevDataRef.current

      if (prev && prev !== data && t < 1) {
        // Cross-fade: the old series fades out while the new one reveals in,
        // rather than hard-swapping the chart under the exercise picker.
        drawSeries(ctx, prev, 1 - eased, 1)
        drawSeries(ctx, data, eased, eased)
      } else {
        drawSeries(ctx, data, 1, reduceMotion ? 1 : eased)
      }

      // Hover marker + scrub line — only once settled, so it never fights
      // the reveal/cross-fade animation.
      const hi = hoverIndexRef.current
      if (hi != null && data[hi] && t >= 1) {
        const x = sc.xFor(hi)
        const y = sc.yFor(data[hi].value)
        ctx.strokeStyle = MUTED
        ctx.lineWidth = 1
        ctx.setLineDash([2, 3])
        ctx.beginPath()
        ctx.moveTo(x, PAD.top)
        ctx.lineTo(x, PAD.top + sc.innerH)
        ctx.stroke()
        ctx.setLineDash([])

        ctx.beginPath()
        ctx.arc(x, y, 4.5, 0, Math.PI * 2)
        ctx.fillStyle = SIGNAL
        ctx.fill()
        ctx.lineWidth = 1.5
        ctx.strokeStyle = SURFACE
        ctx.stroke()
      }
    },
    [data, widthCss, reduceMotion, drawSeries]
  )
  const drawRef = React.useRef(draw)
  drawRef.current = draw

  // Animate on real data changes (mount = reveal-in, exercise switch =
  // cross-fade). Keyed on `scalesReady` rather than `scales` itself so the
  // reveal still fires the moment width becomes measurable on mount (scales
  // is null for the first commit or two, before ResizeObserver reports a
  // width), but a later resize — which changes `scales` without flipping
  // readiness — never replays the entrance animation. See the width effect
  // below for the resize-only redraw.
  const scalesReady = scales != null
  React.useEffect(() => {
    if (!scalesRef.current) return
    const isFirstMount = !mountedRef.current
    mountedRef.current = true

    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)

    if (reduceMotion) {
      progressRef.current = 1
      prevDataRef.current = data
      drawRef.current(1)
      return
    }

    const duration = isFirstMount ? REVEAL_MS : MORPH_MS
    const start = performance.now()
    progressRef.current = 0

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      progressRef.current = t
      drawRef.current(t)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        prevDataRef.current = data
        rafRef.current = null
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, reduceMotion, scalesReady])

  // Resize (or hover change): redraw statically at the settled frame, never
  // restarting the entrance/cross-fade animation.
  React.useEffect(() => {
    if (rafRef.current != null) return
    drawRef.current(1)
  }, [widthCss, scales, hoverIndex])

  const nearestIndex = React.useCallback(
    (clientX: number): number | null => {
      const canvas = canvasRef.current
      const sc = scalesRef.current
      if (!canvas || !sc || data.length === 0) return null
      const rect = canvas.getBoundingClientRect()
      const relX = clientX - rect.left
      if (data.length === 1) return 0
      const t = (relX - PAD.left) / sc.innerW
      return Math.max(0, Math.min(data.length - 1, Math.round(t * (data.length - 1))))
    },
    [data]
  )

  const onPointerMove = React.useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const idx = nearestIndex(e.clientX)
      if (idx != null) setHoverIndex(idx)
    },
    [nearestIndex]
  )
  const onPointerLeave = React.useCallback(() => setHoverIndex(null), [])

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLCanvasElement>) => {
      if (data.length === 0) return
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        setHoverIndex((cur) => Math.max(0, (cur ?? data.length) - 1))
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        setHoverIndex((cur) => Math.min(data.length - 1, cur == null ? 0 : cur + 1))
      } else if (e.key === "Escape") {
        setHoverIndex(null)
      }
    },
    [data.length]
  )

  if (data.length === 0) {
    return (
      <p className="flex h-[200px] items-center justify-center text-sm text-muted">
        No {label.toLowerCase()} logged yet.
      </p>
    )
  }

  const hoverPoint = hoverIndex != null ? data[hoverIndex] : null
  const sc = scales
  const tooltipLeft =
    hoverPoint && sc
      ? Math.min(Math.max(sc.xFor(hoverIndex as number), 52), widthCss - 52)
      : 0
  const tooltipTop = hoverPoint && sc ? sc.yFor(hoverPoint.value) : 0

  const latest = data[data.length - 1]
  const summary = `${label} trend, ${data.length} logged ${
    data.length === 1 ? "set" : "sets"
  } from ${data[0].label} to ${latest.label}. Latest ${fmtNum(latest.value)} ${unit}.`

  return (
    <div ref={containerRef} className="relative" style={{ height: HEIGHT }}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={summary}
        tabIndex={0}
        className="cursor-crosshair rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        style={{ touchAction: "none", width: "100%", height: HEIGHT }}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerMove}
        onPointerLeave={onPointerLeave}
        onKeyDown={onKeyDown}
      />

      {hoverPoint ? (
        <div
          className="pointer-events-none absolute z-10"
          style={{
            left: tooltipLeft,
            top: Math.max(0, tooltipTop - 12),
            transform: "translate(-50%, -100%)",
          }}
        >
          <PanelTooltip
            title={`${hoverPoint.label} · week ${hoverPoint.week}`}
            rows={[{ label, value: hoverPoint.value, unit, color: SIGNAL }]}
          />
        </div>
      ) : null}

      {/* Canvas conveys the same numbers visually; this is the non-visual
          equivalent so the trend isn't locked behind a hover/scrub gesture. */}
      <table className="sr-only">
        <caption>{label} trend</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Week</th>
            <th scope="col">
              {label} ({unit})
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((p) => (
            <tr key={p.date}>
              <td>{p.label}</td>
              <td>{p.week}</td>
              <td>{fmtNum(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
