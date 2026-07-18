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

const CM_PER_INCH = 2.54

export type BodyFatBasis = 'blended' | 'navy' | 'bia' | 'none'

export interface BodyFatInterpretation {
  date: string
  bodyfatPct: number | null
  basis: BodyFatBasis
  navyBodyfatPct: number | null
  navyMeasuredOn: string | null
  biaMedianPct: number | null
  biaSampleCount: number
}

type BodyFatEntry = Pick<
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

/**
 * Build the interpreted body-fat series on each logged body-metric date.
 *
 * Once a weekly Navy measurement exists it remains the anchor until the next
 * one. The BIA component is the median of readings from that date and the prior
 * six calendar days. Before the first Navy measurement, legacy/raw BIA values
 * pass through unchanged.
 */
export function buildBodyFatInterpretations(
  entries: BodyFatEntry[],
): BodyFatInterpretation[] {
  const sorted = [...entries].sort((a, b) => a.measured_on.localeCompare(b.measured_on))

  return sorted.map((entry) => {
    const date = entry.measured_on
    const windowStart = format(
      addDays(parseISO(date), -(BIA_MEDIAN_WINDOW_DAYS - 1)),
      'yyyy-MM-dd',
    )
    const biaValues = sorted
      .filter(
        (candidate) =>
          candidate.measured_on >= windowStart && candidate.measured_on <= date,
      )
      .map(biaBodyFatPct)
      .filter((value): value is number => value != null)
    const biaMedianPct = median(biaValues)

    const navyEntry = [...sorted]
      .reverse()
      .find(
        (candidate) =>
          candidate.measured_on <= date && storedNavyBodyFatPct(candidate) != null,
      )
    const navyBodyfatPct = navyEntry ? storedNavyBodyFatPct(navyEntry) : null

    if (navyBodyfatPct != null && biaMedianPct != null) {
      return {
        date,
        bodyfatPct: round1(
          NAVY_BODY_FAT_WEIGHT * navyBodyfatPct + BIA_MEDIAN_WEIGHT * biaMedianPct,
        ),
        basis: 'blended',
        navyBodyfatPct,
        navyMeasuredOn: navyEntry?.measured_on ?? null,
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
        navyMeasuredOn: navyEntry?.measured_on ?? null,
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

export function navyMeasurementInISOWeek(
  entries: BodyFatEntry[],
  date: string,
  excludeId?: string,
): BodyFatEntry | null {
  const parsed = parseISO(date)
  if (!isValid(parsed)) return null
  const start = format(startOfISOWeek(parsed), 'yyyy-MM-dd')
  const end = format(endOfISOWeek(parsed), 'yyyy-MM-dd')
  return (
    entries.find(
      (entry) =>
        entry.id !== excludeId &&
        entry.measured_on >= start &&
        entry.measured_on <= end &&
        hasNavyMeasurement(entry),
    ) ?? null
  )
}
