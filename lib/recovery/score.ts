/**
 * Recovery score — a 0–100 read on how recovered you are TODAY relative to YOUR
 * OWN baseline, blended from HRV, resting HR, and sleep.
 *
 * The point isn't the absolute number — 50 means "right at your normal," which on
 * its own says nothing. What matters is the DEVIATION: a big drop below your
 * baseline (HRV crashing, resting HR spiking, short sleep) pulls the score down
 * hard and is the real signal. Each metric is z-scored against your trailing
 * baseline, so the score is personal, not a population average.
 *
 * Pure + framework-free so it runs server-side on the Today page.
 */
import { differenceInCalendarDays, parseISO } from 'date-fns'

import type { RecoveryMetric } from '@/lib/types'

const BASELINE_WINDOW_DAYS = 28
const MIN_BASELINE_DAYS = 7
const Z_CAP = 3
/** 1 SD of weighted deviation ≈ 20 points; 50 = your personal baseline. */
const POINTS_PER_SD = 20

type MetricKey = 'hrv' | 'rhr' | 'sleep'

interface MetricSpec {
  key: MetricKey
  label: string
  /** recovery-negative phrasing (this metric is dragging you down). */
  badLabel: string
  /** recovery-positive phrasing. */
  goodLabel: string
  weight: number
  /** lower raw value = better recovery (invert the z). */
  invert?: boolean
  /** diminishing returns above baseline — cap the positive z. */
  capPositive?: number
  get: (m: RecoveryMetric) => number | null
}

const SPECS: MetricSpec[] = [
  {
    key: 'hrv',
    label: 'HRV',
    badLabel: 'HRV low',
    goodLabel: 'HRV high',
    weight: 0.5,
    get: (m) => (m.hrv_ms != null ? Number(m.hrv_ms) : null),
  },
  {
    key: 'rhr',
    label: 'Resting HR',
    badLabel: 'resting HR elevated',
    goodLabel: 'resting HR low',
    weight: 0.3,
    invert: true,
    get: (m) => m.resting_hr,
  },
  {
    key: 'sleep',
    label: 'Sleep',
    badLabel: 'sleep short',
    goodLabel: 'slept well',
    weight: 0.2,
    capPositive: 1.5,
    get: (m) => m.sleep_minutes_asleep,
  },
]

export interface RecoveryComponent {
  key: MetricKey
  label: string
  /** recovery-direction z (positive = better than baseline). */
  z: number
  today: number
  mean: number
  direction: 'up' | 'down' | 'flat'
  driverLabel: string
}

export interface RecoveryScore {
  status: 'ok' | 'building'
  /** 0–100; 50 = your personal baseline. */
  score: number
  /** score − 50: signed distance from your normal. */
  vsBaseline: number
  components: RecoveryComponent[]
  /** notable movers, worst-first, e.g. ['HRV low', 'sleep short']. */
  drivers: string[]
  baselineDays: number
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}
function stddev(xs: number[], m: number): number {
  if (xs.length < 2) return 0
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}
function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

/**
 * Score `targetDate` against the trailing baseline in `history` (any order).
 * Returns null if the target day isn't present; status 'building' until there's
 * enough baseline history for at least one metric.
 */
export function computeRecoveryScore(
  history: RecoveryMetric[],
  targetDate: string,
): RecoveryScore | null {
  const target = history.find((m) => m.metric_date === targetDate)
  if (!target) return null

  const targetD = parseISO(targetDate)
  const baseline = history.filter((m) => {
    if (m.metric_date === targetDate) return false
    const age = differenceInCalendarDays(targetD, parseISO(m.metric_date))
    return age > 0 && age <= BASELINE_WINDOW_DAYS
  })

  const components: RecoveryComponent[] = []
  let weightedZ = 0
  let weightSum = 0
  let baselineDays = 0

  for (const spec of SPECS) {
    const today = spec.get(target)
    if (today == null) continue
    const xs = baseline.map(spec.get).filter((v): v is number => v != null)
    if (xs.length < MIN_BASELINE_DAYS) continue
    const m = mean(xs)
    const sd = stddev(xs, m)
    if (sd <= 0) continue
    baselineDays = Math.max(baselineDays, xs.length)

    const rawZ = (today - m) / sd
    let z = spec.invert ? -rawZ : rawZ
    z = clamp(z, -Z_CAP, Z_CAP)
    if (spec.capPositive != null && z > spec.capPositive) z = spec.capPositive

    weightedZ += spec.weight * z
    weightSum += spec.weight
    const direction = z >= 0.4 ? 'up' : z <= -0.4 ? 'down' : 'flat'
    components.push({
      key: spec.key,
      label: spec.label,
      z,
      today,
      mean: m,
      direction,
      driverLabel: z < 0 ? spec.badLabel : spec.goodLabel,
    })
  }

  if (weightSum === 0) {
    return { status: 'building', score: 50, vsBaseline: 0, components, drivers: [], baselineDays }
  }

  const z = weightedZ / weightSum
  const score = Math.round(clamp(50 + POINTS_PER_SD * z, 1, 99))

  const drivers = components
    .filter((c) => Math.abs(c.z) >= 0.5)
    .sort((a, b) => a.z - b.z) // most-negative first — drops matter most
    .map((c) => c.driverLabel)

  return { status: 'ok', score, vsBaseline: score - 50, components, drivers, baselineDays }
}

/**
 * Map a recovery score (0–100) to a session-readiness PREFILL (1–10) — a gentle,
 * low-biased nudge, not a strong driver. Your baseline (50) prefills 5 (below the
 * old default of 7), it's capped at 7 even on great days, and it dips into the
 * engine's conservative band (≤4) when you're under-recovered. The user can always
 * override before starting.
 */
export function suggestedReadiness(score: number): number {
  return clamp(Math.round(5 + (score - 50) / 25), 2, 7)
}

/** UI bucket for a score: headline, tone, and a fallback sub-line. */
export function recoveryBand(score: number): {
  headline: string
  tone: 'green' | 'neutral' | 'amber' | 'red'
  fallback: string
} {
  if (score >= 58) return { headline: 'Above your usual', tone: 'green', fallback: 'Recovered — green light.' }
  if (score >= 44) return { headline: 'Around your usual', tone: 'neutral', fallback: 'In line with your baseline.' }
  if (score >= 30) return { headline: 'Below your usual', tone: 'amber', fallback: 'A bit under — manage the load.' }
  return { headline: 'Well below your usual', tone: 'red', fallback: 'Run-down — take it easy today.' }
}
