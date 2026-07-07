import { addDays, differenceInCalendarDays, parseISO } from 'date-fns'

import type { Block, BodyMetric } from '@/lib/types'

export type WeightBasis = 'latest' | 'block_floor'
type BodyFatBasis = 'lean_retention' | 'measured' | 'none'
const DRY_WATER_DROP_PCT = 0.02
const RECENT_HIGH_DAYS = 21

interface WeightReading {
  date: string
  weight: number
}

export interface NormalizedBodyweight {
  /** Dashboard-safe current weight. In a cut, this is the block low-water mark. */
  value: number | null
  /** The latest raw scale reading, preserved for exact entry/history displays. */
  rawLatest: number | null
  basis: WeightBasis
  date: string | null
}

export interface BodyFatEstimatePoint {
  date: string
  bodyfat: number
}

export interface BodyFatEstimate {
  latest: number | null
  basis: BodyFatBasis
  baselineDate: string | null
  baselineBodyfat: number | null
  points: BodyFatEstimatePoint[]
}

type LeanRetentionBaseline = BodyMetric & { bodyweight: number; bodyfat_pct: number }

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function leanRetentionBaseline(entries: BodyMetric[]): LeanRetentionBaseline | null {
  return (
    entries.find(
      (e): e is LeanRetentionBaseline =>
        e.bodyweight != null &&
        e.bodyweight > 0 &&
        e.bodyfat_pct != null &&
        e.bodyfat_pct > 0 &&
        e.bodyfat_pct < 80,
    ) ?? null
  )
}

function recentHighWeight(readings: WeightReading[], date: string | null): number | null {
  if (readings.length === 0) return null
  const end = date ? parseISO(date) : parseISO(readings[readings.length - 1].date)
  const start = addDays(end, -RECENT_HIGH_DAYS + 1)
  const recent = readings.filter((r) => {
    const d = parseISO(r.date)
    return d >= start && d <= end
  })
  const pool = recent.length > 0 ? recent : readings
  return pool.reduce((max, r) => Math.max(max, r.weight), pool[0].weight)
}

function dryLeanMass(entries: BodyMetric[], date: string | null): number | null {
  const baseline = leanRetentionBaseline(entries)
  if (!baseline) return null

  const readings = weightReadings(entries).filter((r) => !date || r.date <= date)
  const high = recentHighWeight(readings, date) ?? baseline.bodyweight
  const fatMass = baseline.bodyweight * (baseline.bodyfat_pct / 100)
  return Math.max(0, baseline.bodyweight - fatMass - high * DRY_WATER_DROP_PCT)
}

export function estimateBodyFatAtWeightFromLeanRetention(
  entries: BodyMetric[],
  bodyweight: number | null,
  date: string | null = null,
): number | null {
  if (bodyweight == null || bodyweight <= 0) return null

  const leanMass = dryLeanMass(entries, date)
  if (leanMass == null) return null

  return round1(clamp(((bodyweight - leanMass) / bodyweight) * 100, 1, 80))
}

function isCutBlock(block: Pick<Block, 'phase' | 'start_date'> | null | undefined) {
  return block?.phase === 'cut' && !!block.start_date
}

function weightReadings(entries: BodyMetric[]): WeightReading[] {
  return entries
    .filter((e): e is BodyMetric & { bodyweight: number } => e.bodyweight != null)
    .map((e) => ({ date: e.measured_on, weight: e.bodyweight }))
}

function scopeFromBlock(
  readings: WeightReading[],
  block: Pick<Block, 'phase' | 'start_date'> | null | undefined,
) {
  if (!isCutBlock(block)) return readings
  const startDate = block?.start_date
  if (!startDate) return readings
  const start = parseISO(startDate)
  return readings.filter((r) => parseISO(r.date) >= start)
}

function hasBlockStart(
  block: Pick<Block, 'start_date'> | null | undefined,
): block is Pick<Block, 'start_date'> & { start_date: string } {
  return !!block?.start_date
}

function scopeEntriesFromBlock(
  entries: BodyMetric[],
  block: Pick<Block, 'start_date'> | null | undefined,
) {
  if (!hasBlockStart(block)) return entries
  const start = parseISO(block.start_date)
  return entries.filter((e) => parseISO(e.measured_on) >= start)
}

function lowest(readings: WeightReading[]): WeightReading | null {
  if (readings.length === 0) return null
  return readings.reduce((best, r) => (r.weight < best.weight ? r : best), readings[0])
}

export function normalizedBodyweight(
  entries: BodyMetric[],
  block?: Pick<Block, 'phase' | 'start_date'> | null,
): NormalizedBodyweight {
  const readings = weightReadings(entries)
  const latest = readings[readings.length - 1] ?? null
  if (!latest) {
    return { value: null, rawLatest: null, basis: 'latest', date: null }
  }

  if (isCutBlock(block)) {
    const floor = lowest(scopeFromBlock(readings, block))
    if (floor) {
      return {
        value: round1(floor.weight),
        rawLatest: round1(latest.weight),
        basis: 'block_floor',
        date: floor.date,
      }
    }
  }

  return {
    value: round1(latest.weight),
    rawLatest: round1(latest.weight),
    basis: 'latest',
    date: latest.date,
  }
}

export function normalizedDeltaOver(
  entries: BodyMetric[],
  days: number,
  block?: Pick<Block, 'phase' | 'start_date'> | null,
): number | null {
  const readings = weightReadings(entries)
  const latest = readings[readings.length - 1] ?? null
  if (!latest) return null

  const latestDate = parseISO(latest.date)
  const cutoff = addDays(latestDate, -days)
  const priorEntries = entries.filter((e) => parseISO(e.measured_on) <= cutoff)
  if (priorEntries.length === 0) return null

  const current = normalizedBodyweight(entries, block).value
  const prior = normalizedBodyweight(priorEntries, block).value
  if (current == null || prior == null) return null

  return round1(current - prior)
}

export function normalizedChangeFromStart(
  entries: BodyMetric[],
  block?: Pick<Block, 'phase' | 'start_date'> | null,
): number | null {
  const readings = weightReadings(entries)
  if (readings.length < 2) return null

  const scoped = scopeFromBlock(readings, block)
  const first = scoped[0] ?? readings[0]
  const current = normalizedBodyweight(entries, block).value
  if (current == null) return null

  return round1(current - first.weight)
}

export function blockFloorWeeklyRate(
  entries: BodyMetric[],
  block: Pick<Block, 'phase' | 'start_date'> | null | undefined,
  options: { settleDays?: number; minSpanDays?: number } = {},
): { rate: number | null; settling: boolean } {
  if (!isCutBlock(block)) return { rate: null, settling: false }

  const settleDays = options.settleDays ?? 0
  const minSpanDays = options.minSpanDays ?? 0
  const startDate = block?.start_date
  if (!startDate) return { rate: null, settling: false }
  const start = addDays(parseISO(startDate), settleDays)
  const scoped = weightReadings(entries).filter((r) => parseISO(r.date) >= start)
  if (scoped.length < 2) return { rate: null, settling: true }

  const first = scoped[0]
  const latest = scoped[scoped.length - 1]
  const spanDays = differenceInCalendarDays(parseISO(latest.date), parseISO(first.date))
  if (spanDays < minSpanDays) return { rate: null, settling: true }

  const floor = lowest(scoped)
  if (!floor) return { rate: null, settling: true }

  return {
    rate: round1(((floor.weight - first.weight) * 7) / spanDays),
    settling: false,
  }
}

export function estimateBodyFatFromLeanRetention(
  entries: BodyMetric[],
  block?: Pick<Block, 'start_date'> | null,
): BodyFatEstimate {
  const baseline = leanRetentionBaseline(entries)
  const scopedEntries = scopeEntriesFromBlock(entries, block)

  if (!baseline) {
    const latestMeasured = [...scopedEntries]
      .reverse()
      .find((e) => e.bodyfat_pct != null)?.bodyfat_pct ?? null
    return {
      latest: latestMeasured == null ? null : round1(latestMeasured),
      basis: latestMeasured == null ? 'none' : 'measured',
      baselineDate: null,
      baselineBodyfat: null,
      points: [],
    }
  }

  const points = scopedEntries
    .filter(
      (e): e is BodyMetric & { bodyweight: number } =>
        e.bodyweight != null &&
        e.bodyweight > 0 &&
        e.measured_on >= baseline.measured_on,
    )
    .map((e) => ({
      date: e.measured_on,
      bodyfat: estimateBodyFatAtWeightFromLeanRetention(entries, e.bodyweight, e.measured_on) ?? 0,
    }))
    .filter((p) => p.bodyfat > 0)

  return {
    latest: points[points.length - 1]?.bodyfat ?? null,
    basis: 'lean_retention',
    baselineDate: baseline.measured_on,
    baselineBodyfat: round1(baseline.bodyfat_pct),
    points,
  }
}
