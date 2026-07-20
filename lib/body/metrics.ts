import { addDays, differenceInCalendarDays, parseISO } from 'date-fns'

import type { Block, BodyMetric } from '@/lib/types'

export type WeightBasis = 'latest' | 'block_floor'
type BodyFatBasis = 'lean_retention' | 'measured' | 'none'
const DRY_WATER_DROP_PCT = 0.02
const RECENT_HIGH_DAYS = 21
const BODY_FAT_WEIGHT_PAIR_DAYS = 7

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
  bodyweight: number
}

export interface BodyFatEstimate {
  latest: number | null
  basis: BodyFatBasis
  baselineDate: string | null
  baselineBodyfat: number | null
  points: BodyFatEstimatePoint[]
  breakdown: BodyFatEstimateBreakdown | null
}

interface LeanRetentionBaseline {
  measured_on: string
  bodyweight: number
  bodyweightMeasuredOn: string
  bodyfat_pct: number
}

export interface BodyFatEstimateBreakdown {
  date: string | null
  bodyweight: number
  finalEstimate: number
  leanEstimate: number
  baselineDate: string
  baselineWeight: number
  baselineWeightDate: string
  baselineBodyfat: number
  baselineLeanMass: number
  recentHighWeight: number
  observedWeightLoss: number
  dryWaterAllowanceCap: number
  dryWaterDrop: number
  dryLeanMass: number
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function dateKey(date: string): string {
  return date.slice(0, 10)
}

function validBodyFat(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value > 0 && value < 80
}

/**
 * Resolve actual body-fat measurements into lean-mass anchors. Interpreted
 * body-fat values can be carried onto later weight-only rows, so only a raw BIA
 * or Navy reading starts a new anchor. Legacy bodyfat_pct-only rows remain
 * eligible before structured BIA/Navy data begins.
 *
 * A tape-only measurement can use the most recent weight from the prior seven
 * days. This lets a fresh weekly Navy reading recalibrate the cut estimate
 * without forcing a second weigh-in on the same row.
 */
function leanRetentionAnchors(
  entries: BodyMetric[],
): LeanRetentionBaseline[] {
  const sorted = [...entries].sort((a, b) =>
    a.measured_on.localeCompare(b.measured_on),
  )
  const firstStructuredSignalDate = sorted.find(
    (entry) =>
      validBodyFat(entry.bia_bodyfat_pct) ||
      validBodyFat(entry.navy_bodyfat_pct),
  )?.measured_on
  let latestWeight: { measuredOn: string; value: number } | null = null
  const anchors: LeanRetentionBaseline[] = []

  for (const entry of sorted) {
    if (entry.bodyweight != null && Number.isFinite(entry.bodyweight) && entry.bodyweight > 0) {
      latestWeight = { measuredOn: entry.measured_on, value: entry.bodyweight }
    }

    const hasStructuredSignal =
      validBodyFat(entry.bia_bodyfat_pct) ||
      validBodyFat(entry.navy_bodyfat_pct)
    const hasLegacySignal =
      validBodyFat(entry.bodyfat_pct) &&
      (firstStructuredSignalDate == null ||
        entry.measured_on < firstStructuredSignalDate)
    if (
      !validBodyFat(entry.bodyfat_pct) ||
      (!hasStructuredSignal && !hasLegacySignal) ||
      latestWeight == null
    ) {
      continue
    }

    const weightAge = differenceInCalendarDays(
      parseISO(entry.measured_on),
      parseISO(latestWeight.measuredOn),
    )
    if (weightAge > BODY_FAT_WEIGHT_PAIR_DAYS) continue

    anchors.push({
      measured_on: entry.measured_on,
      bodyweight: latestWeight.value,
      bodyweightMeasuredOn: latestWeight.measuredOn,
      bodyfat_pct: entry.bodyfat_pct,
    })
  }

  return anchors
}

/**
 * Use the freshest real measurement available by `date`. During an active
 * block, prefer in-block measurements; until one exists, carry only the
 * nearest pre-block anchor forward.
 */
function leanRetentionBaseline(
  entries: BodyMetric[],
  date: string | null,
  blockStartDate?: string | null,
): LeanRetentionBaseline | null {
  const eligible = leanRetentionAnchors(entries).filter(
    (anchor) => !date || anchor.measured_on <= date,
  )
  if (!blockStartDate) return eligible.at(-1) ?? null

  const inBlock = eligible.filter(
    (anchor) => anchor.measured_on >= blockStartDate,
  )
  return inBlock.at(-1) ?? eligible.at(-1) ?? null
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

function leanBodyFatBreakdown(
  entries: BodyMetric[],
  bodyweight: number,
  date: string | null,
  blockStartDate?: string | null,
): Omit<
  BodyFatEstimateBreakdown,
  'finalEstimate'
> | null {
  const baseline = leanRetentionBaseline(entries, date, blockStartDate)
  if (!baseline) return null

  const readings = weightReadings(entries).filter((r) => !date || r.date <= date)
  const high = recentHighWeight(readings, date) ?? baseline.bodyweight
  const baselineLeanMass = baseline.bodyweight * (1 - baseline.bodyfat_pct / 100)
  const observedWeightLoss = Math.max(0, baseline.bodyweight - bodyweight)
  const dryWaterAllowanceCap = high * DRY_WATER_DROP_PCT
  const dryWaterDrop = Math.min(observedWeightLoss, dryWaterAllowanceCap)
  const dryLeanMass = Math.max(0, baselineLeanMass - dryWaterDrop)
  const leanEstimate = clamp(((bodyweight - dryLeanMass) / bodyweight) * 100, 1, 80)

  return {
    date,
    bodyweight: round1(bodyweight),
    leanEstimate: round1(leanEstimate),
    baselineDate: dateKey(baseline.measured_on),
    baselineWeight: round1(baseline.bodyweight),
    baselineWeightDate: dateKey(baseline.bodyweightMeasuredOn),
    baselineBodyfat: round1(baseline.bodyfat_pct),
    baselineLeanMass: round1(baselineLeanMass),
    recentHighWeight: round1(high),
    observedWeightLoss: round1(observedWeightLoss),
    dryWaterAllowanceCap: round1(dryWaterAllowanceCap),
    dryWaterDrop: round1(dryWaterDrop),
    dryLeanMass: round1(dryLeanMass),
  }
}

export function estimateBodyFatBreakdown(
  entries: BodyMetric[],
  bodyweight: number | null,
  date: string | null = null,
): BodyFatEstimateBreakdown | null {
  if (bodyweight == null || bodyweight <= 0) return null

  const base = leanBodyFatBreakdown(entries, bodyweight, date)
  if (!base) return null

  return {
    ...base,
    finalEstimate: base.leanEstimate,
  }
}

export function estimateBodyFatAtWeightFromLeanRetention(
  entries: BodyMetric[],
  bodyweight: number | null,
  date: string | null = null,
): number | null {
  return estimateBodyFatBreakdown(entries, bodyweight, date)?.finalEstimate ?? null
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
  const sortedEntries = [...entries].sort((a, b) =>
    a.measured_on.localeCompare(b.measured_on),
  )
  const anchors = leanRetentionAnchors(sortedEntries)
  const scopedEntries = scopeEntriesFromBlock(sortedEntries, block)
  const useBlockFloor = hasBlockStart(block)

  if (anchors.length === 0) {
    const latestMeasured = [...scopedEntries]
      .reverse()
      .find((e) => e.bodyfat_pct != null)?.bodyfat_pct ?? null
    return {
      latest: latestMeasured == null ? null : round1(latestMeasured),
      basis: latestMeasured == null ? 'none' : 'measured',
      baselineDate: null,
      baselineBodyfat: null,
      points: [],
      breakdown: null,
    }
  }

  let currentWeight: number | null = null
  let floorWeight: number | null = null
  let activeBaselineDate: string | null = null
  let latestBreakdown: BodyFatEstimateBreakdown | null = null
  const points: BodyFatEstimatePoint[] = []

  for (const entry of scopedEntries) {
    if (
      entry.bodyweight != null &&
      Number.isFinite(entry.bodyweight) &&
      entry.bodyweight > 0
    ) {
      currentWeight = entry.bodyweight
      floorWeight =
        floorWeight == null
          ? entry.bodyweight
          : Math.min(floorWeight, entry.bodyweight)
    }

    const baseline = leanRetentionBaseline(
      sortedEntries,
      dateKey(entry.measured_on),
      block?.start_date,
    )
    if (!baseline) continue

    // A new real BIA/Navy reading supersedes the older lean-mass model. Reset
    // the cut floor at that anchor so an earlier low weigh-in cannot distort a
    // newer direct measurement.
    if (baseline.measured_on !== activeBaselineDate) {
      activeBaselineDate = baseline.measured_on
      currentWeight = baseline.bodyweight
      floorWeight = baseline.bodyweight
    }

    if (currentWeight == null) continue
    const estimateWeight = useBlockFloor
      ? (floorWeight ?? currentWeight)
      : currentWeight
    const breakdown = leanBodyFatBreakdown(
      sortedEntries,
      estimateWeight,
      dateKey(entry.measured_on),
      block?.start_date,
    )
    if (!breakdown) continue

    latestBreakdown = {
      ...breakdown,
      finalEstimate: breakdown.leanEstimate,
    }
    points.push({
      date: entry.measured_on,
      bodyweight: round1(estimateWeight),
      bodyfat: latestBreakdown.finalEstimate,
    })
  }

  return {
    latest: points[points.length - 1]?.bodyfat ?? null,
    basis: 'lean_retention',
    baselineDate: latestBreakdown?.baselineDate ?? null,
    baselineBodyfat: latestBreakdown?.baselineBodyfat ?? null,
    points,
    breakdown: latestBreakdown,
  }
}
