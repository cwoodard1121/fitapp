import {
  addDays,
  endOfISOWeek,
  format,
  isValid,
  parseISO,
  startOfISOWeek,
} from 'date-fns'

import type { BodyMetric } from '@/lib/types'

export const NAVY_BODY_FAT_WEIGHT = 0.65
export const BIA_MEDIAN_WEIGHT = 0.35
export const BIA_MEDIAN_WINDOW_DAYS = 7
export const NAVY_OUTLIER_RELATIVE_THRESHOLD = 0.2

const CM_PER_INCH = 2.54

export type BodyFatBasis = 'blended' | 'navy' | 'bia' | 'none'

export interface BodyFatInterpretation {
  date: string
  bodyfatPct: number | null
  basis: BodyFatBasis
  navyBodyfatPct: number | null
  navyMeasuredOn: string | null
  navySampleCount: number
  navyExcludedSampleCount: number
  biaMedianPct: number | null
  biaSampleCount: number
}

export type BodyFatEntry = Pick<
  BodyMetric,
  | 'id'
  | 'measured_on'
  | 'bodyfat_pct'
  | 'bia_bodyfat_pct'
  | 'height_cm'
  | 'neck_cm'
  | 'waist_cm'
  | 'navy_bodyfat_pct'
>

export interface NavyBodyFatSample {
  id: string
  measuredOn: string
  bodyfatPct: number
  referenceBodyfatPct: number | null
  accepted: boolean
}

export interface NavyBodyFatWeekSummary {
  weekStart: string
  weekEnd: string
  bodyfatPct: number | null
  acceptedSampleCount: number
  excludedSampleCount: number
  totalSampleCount: number
  samples: NavyBodyFatSample[]
}

function round1(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10
}

function validBodyFat(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value >= 1 && value <= 75
}

/**
 * Read the raw BIA value with a legacy fallback. Deployments can therefore
 * migrate old rows without changing what the athlete sees.
 */
export function biaBodyFatPct(
  entry: Pick<BodyFatEntry, 'bia_bodyfat_pct' | 'bodyfat_pct'>,
): number | null {
  const value = entry.bia_bodyfat_pct ?? entry.bodyfat_pct
  return validBodyFat(value) ? value : null
}

/**
 * Male U.S. Navy circumference equation. Inputs are stored in centimetres but
 * converted to inches because the published equation's constants use inches.
 */
export function calculateNavyBodyFatPct({
  heightCm,
  neckCm,
  waistCm,
}: {
  heightCm: number
  neckCm: number
  waistCm: number
}): number | null {
  if (
    !Number.isFinite(heightCm) ||
    !Number.isFinite(neckCm) ||
    !Number.isFinite(waistCm) ||
    heightCm <= 0 ||
    neckCm <= 0 ||
    waistCm <= neckCm
  ) {
    return null
  }

  const heightIn = heightCm / CM_PER_INCH
  const circumferenceDifferenceIn = (waistCm - neckCm) / CM_PER_INCH
  const estimate =
    86.01 * Math.log10(circumferenceDifferenceIn) -
    70.041 * Math.log10(heightIn) +
    36.76

  return validBodyFat(estimate) ? round1(estimate) : null
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? round1((sorted[middle - 1] + sorted[middle]) / 2)
    : round1(sorted[middle])
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return round1(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function storedNavyBodyFatPct(entry: BodyFatEntry): number | null {
  if (validBodyFat(entry.navy_bodyfat_pct)) return entry.navy_bodyfat_pct
  if (entry.height_cm == null || entry.neck_cm == null || entry.waist_cm == null) {
    return null
  }
  return calculateNavyBodyFatPct({
    heightCm: entry.height_cm,
    neckCm: entry.neck_cm,
    waistCm: entry.waist_cm,
  })
}

export function hasNavyMeasurement(entry: BodyFatEntry): boolean {
  return storedNavyBodyFatPct(entry) != null
}

function biaValuesInWindow(entries: BodyFatEntry[], date: string): number[] {
  const windowStart = format(
    addDays(parseISO(date), -(BIA_MEDIAN_WINDOW_DAYS - 1)),
    'yyyy-MM-dd',
  )
  return entries
    .filter(
      (candidate) =>
        candidate.measured_on >= windowStart && candidate.measured_on <= date,
    )
    .map(biaBodyFatPct)
    .filter((value): value is number => value != null)
}

/**
 * The ordinary, non-Navy comparison value used to vet a tape estimate. Prefer
 * the trailing seven-day BIA median; if there are no recent readings, retain
 * the latest earlier BIA reading as the athlete's baseline.
 */
export function nonNavyBodyFatReference(
  entries: BodyFatEntry[],
  date: string,
): number | null {
  const recentMedian = median(biaValuesInWindow(entries, date))
  if (recentMedian != null) return recentMedian

  const latest = [...entries]
    .filter((entry) => entry.measured_on <= date)
    .sort((a, b) => b.measured_on.localeCompare(a.measured_on))
    .map(biaBodyFatPct)
    .find((value): value is number => value != null)
  return latest ?? null
}

export function navyMeasurementsInISOWeek(
  entries: BodyFatEntry[],
  date: string,
  excludeId?: string,
): BodyFatEntry[] {
  const parsed = parseISO(date)
  if (!isValid(parsed)) return []
  const start = format(startOfISOWeek(parsed), 'yyyy-MM-dd')
  const end = format(endOfISOWeek(parsed), 'yyyy-MM-dd')
  return entries
    .filter(
      (entry) =>
        entry.id !== excludeId &&
        entry.measured_on >= start &&
        entry.measured_on <= end &&
        hasNavyMeasurement(entry),
    )
    .sort((a, b) => a.measured_on.localeCompare(b.measured_on))
}

function summarizeNavyWeek(
  entries: BodyFatEntry[],
  weekDate: string,
  throughDate: string,
): NavyBodyFatWeekSummary | null {
  const parsed = parseISO(weekDate)
  if (!isValid(parsed)) return null
  const weekStart = format(startOfISOWeek(parsed), 'yyyy-MM-dd')
  const weekEnd = format(endOfISOWeek(parsed), 'yyyy-MM-dd')
  const measurements = navyMeasurementsInISOWeek(entries, weekDate).filter(
    (entry) => entry.measured_on <= throughDate,
  )
  if (measurements.length === 0) return null

  const samples = measurements.flatMap((entry): NavyBodyFatSample[] => {
    const bodyfatPct = storedNavyBodyFatPct(entry)
    if (bodyfatPct == null) return []
    const referenceBodyfatPct = nonNavyBodyFatReference(entries, entry.measured_on)
    const accepted =
      referenceBodyfatPct == null ||
      Math.abs(bodyfatPct - referenceBodyfatPct) / referenceBodyfatPct <=
        NAVY_OUTLIER_RELATIVE_THRESHOLD
    return [
      {
        id: entry.id,
        measuredOn: entry.measured_on,
        bodyfatPct,
        referenceBodyfatPct,
        accepted,
      },
    ]
  })
  const acceptedValues = samples
    .filter((sample) => sample.accepted)
    .map((sample) => sample.bodyfatPct)

  return {
    weekStart,
    weekEnd,
    bodyfatPct: mean(acceptedValues),
    acceptedSampleCount: acceptedValues.length,
    excludedSampleCount: samples.length - acceptedValues.length,
    totalSampleCount: samples.length,
    samples,
  }
}

/**
 * Average the Navy measurements in the requested ISO week through `date`.
 * Samples more than 20% away from their non-Navy BIA reference stay stored but
 * are excluded from the average.
 */
export function navyBodyFatSummaryInISOWeek(
  entries: BodyFatEntry[],
  date: string,
): NavyBodyFatWeekSummary | null {
  return summarizeNavyWeek(entries, date, date)
}

function latestAcceptedNavySummary(
  entries: BodyFatEntry[],
  date: string,
): NavyBodyFatWeekSummary | null {
  const weekStarts = [
    ...new Set(
      entries
        .filter((entry) => entry.measured_on <= date && hasNavyMeasurement(entry))
        .map((entry) => format(startOfISOWeek(parseISO(entry.measured_on)), 'yyyy-MM-dd')),
    ),
  ].sort((a, b) => b.localeCompare(a))

  for (const weekStart of weekStarts) {
    const summary = summarizeNavyWeek(entries, weekStart, date)
    if (summary?.bodyfatPct != null) return summary
  }
  return null
}

/**
 * Build the interpreted body-fat series on each logged body-metric date.
 *
 * Each week's accepted Navy measurements are averaged, and that weekly average
 * remains the anchor until a later week has an accepted sample. The BIA
 * component is the median of readings from that date and the prior six
 * calendar days. Before the first accepted Navy measurement, legacy/raw BIA
 * values pass through unchanged.
 */
export function buildBodyFatInterpretations(
  entries: BodyFatEntry[],
): BodyFatInterpretation[] {
  const sorted = [...entries].sort((a, b) => a.measured_on.localeCompare(b.measured_on))

  return sorted.map((entry) => {
    const date = entry.measured_on
    const biaValues = biaValuesInWindow(sorted, date)
    const biaMedianPct = median(biaValues)

    const navySummary = latestAcceptedNavySummary(sorted, date)
    const navyBodyfatPct = navySummary?.bodyfatPct ?? null
    const latestAcceptedNavySample = navySummary?.samples
      .filter((sample) => sample.accepted)
      .at(-1)

    if (navyBodyfatPct != null && biaMedianPct != null) {
      return {
        date,
        bodyfatPct: round1(
          NAVY_BODY_FAT_WEIGHT * navyBodyfatPct + BIA_MEDIAN_WEIGHT * biaMedianPct,
        ),
        basis: 'blended',
        navyBodyfatPct,
        navyMeasuredOn: latestAcceptedNavySample?.measuredOn ?? null,
        navySampleCount: navySummary?.acceptedSampleCount ?? 0,
        navyExcludedSampleCount: navySummary?.excludedSampleCount ?? 0,
        biaMedianPct,
        biaSampleCount: biaValues.length,
      }
    }

    if (navyBodyfatPct != null) {
      return {
        date,
        bodyfatPct: navyBodyfatPct,
        basis: 'navy',
        navyBodyfatPct,
        navyMeasuredOn: latestAcceptedNavySample?.measuredOn ?? null,
        navySampleCount: navySummary?.acceptedSampleCount ?? 0,
        navyExcludedSampleCount: navySummary?.excludedSampleCount ?? 0,
        biaMedianPct: null,
        biaSampleCount: 0,
      }
    }

    const rawBia = biaBodyFatPct(entry)
    return {
      date,
      bodyfatPct: rawBia,
      basis: rawBia == null ? 'none' : 'bia',
      navyBodyfatPct: null,
      navyMeasuredOn: null,
      navySampleCount: 0,
      navyExcludedSampleCount: 0,
      biaMedianPct,
      biaSampleCount: biaValues.length,
    }
  })
}

/** Clone rows with bodyfat_pct replaced by the app's interpreted value. */
export function interpretBodyMetrics(entries: BodyMetric[]): BodyMetric[] {
  const byDate = new Map(
    buildBodyFatInterpretations(entries).map((point) => [point.date, point]),
  )
  return entries.map((entry) => ({
    ...entry,
    bodyfat_pct: byDate.get(entry.measured_on)?.bodyfatPct ?? null,
  }))
}

export function latestBodyFatInterpretation(
  entries: BodyFatEntry[],
): BodyFatInterpretation | null {
  return (
    [...buildBodyFatInterpretations(entries)]
      .reverse()
      .find((point) => point.bodyfatPct != null) ?? null
  )
}
