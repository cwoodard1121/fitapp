import { addDays, differenceInCalendarDays, format, isValid, parseISO } from 'date-fns'

export interface WeightTrendInput {
  measured_on: string
  bodyweight: number | null
}

export interface BodyFatTrendInput {
  measured_on: string
  bodyfat_pct: number | null
}

export interface WeightTrendPoint {
  /** ISO calendar date. */
  date: string
  /** The scale reading for this day, or null when no weigh-in was logged. */
  weight: number | null
  /** Trailing water-resistant estimate ending on this date. */
  average: number | null
  /** Number of logged days represented by the average. */
  sampleCount: number
}

export interface BodyFatTrendPoint {
  /** ISO calendar date. */
  date: string
  /** The body-fat reading for this day, or null when none was logged. */
  bodyfat: number | null
  /** Trailing calendar-day average ending on this date. */
  average: number | null
  /** Number of logged days represented by the average. */
  sampleCount: number
}

export type TrendWindowDays = 7 | 14

export interface WeightTrendSummary {
  currentAverage: number | null
  startAverage: number | null
  change: number | null
  percentChange: number | null
  weeklyRate: number | null
  elapsedDays: number
  currentSampleCount: number
  direction: 'up' | 'down' | 'flat' | 'insufficient'
}

interface DailyReading {
  date: string
  value: number
}

const round = (value: number, precision: number) => {
  const scale = 10 ** precision
  return Math.round((value + Number.EPSILON) * scale) / scale
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

function dailyMean(readings: DailyReading[]): number | null {
  return mean(readings.map((reading) => reading.value))
}

/**
 * Keep the normal rolling-mean behaviour for sparse windows, then use a
 * robust fitted line plus Huber weights once there are enough readings to
 * identify an outlier. A legitimate rise or fall stays part of the mean because
 * points are weighted by their residual from the fitted line, not merely their
 * distance from the middle weight. Raw readings are never changed; only an
 * acute water spike's influence on the trend is reduced.
 */
function waterResistantMean(readings: DailyReading[]): number | null {
  if (readings.length < 5) return dailyMean(readings)

  const firstDay = parseISO(readings[0].date)
  const dayOffsets = readings.map((reading) =>
    differenceInCalendarDays(parseISO(reading.date), firstDay),
  )
  const slopes: number[] = []
  for (let i = 0; i < readings.length; i++) {
    for (let j = i + 1; j < readings.length; j++) {
      const span = dayOffsets[j] - dayOffsets[i]
      if (span > 0) {
        slopes.push((readings[j].value - readings[i].value) / span)
      }
    }
  }
  const slope = median(slopes) ?? 0
  const intercept = median(
    readings.map((reading, index) => reading.value - slope * dayOffsets[index]),
  )
  if (intercept == null) return null
  const residuals = readings.map(
    (reading, index) => reading.value - (intercept + slope * dayOffsets[index]),
  )
  const absoluteResiduals = residuals.map(Math.abs)
  const medianAbsoluteDeviation = median(absoluteResiduals) ?? 0
  const values = readings.map((reading) => reading.value)
  const center = median(values)
  if (center == null) return null

  const robustScale = Math.max(
    medianAbsoluteDeviation * 1.4826,
    Math.abs(center) * 0.001,
  )
  const cutoff = robustScale * 1.5

  let weightedSum = 0
  let weightSum = 0
  for (let index = 0; index < readings.length; index++) {
    const value = readings[index].value
    const residual = absoluteResiduals[index]
    const weight = residual <= cutoff ? 1 : cutoff / residual
    weightedSum += value * weight
    weightSum += weight
  }

  return weightSum > 0 ? weightedSum / weightSum : center
}

/**
 * Build a trailing calendar-day series.
 *
 * The previous chart averaged the last seven *entries*. That can cover far more
 * than the selected window when weigh-ins are missed. This implementation uses
 * a true calendar interval, averages duplicate same-day readings first, and only
 * exposes the rolling value after the full calendar window has elapsed.
 */
function buildRollingTrend(
  entries: { measured_on: string; value: number | null }[],
  valid: (value: number) => boolean,
  windowDays: TrendWindowDays,
  throughDate?: string,
  requireFullWindow = true,
  windowAverage: (readings: DailyReading[]) => number | null = dailyMean,
): { date: string; value: number | null; average: number | null; sampleCount: number }[] {
  const valuesByDate = new Map<string, number[]>()

  for (const entry of entries) {
    if (
      entry.value == null ||
      !Number.isFinite(entry.value) ||
      !valid(entry.value)
    ) {
      continue
    }

    const parsed = parseISO(entry.measured_on)
    if (!isValid(parsed)) continue
    const date = format(parsed, 'yyyy-MM-dd')
    const existing = valuesByDate.get(date) ?? []
    existing.push(entry.value)
    valuesByDate.set(date, existing)
  }

  const readings: DailyReading[] = [...valuesByDate]
    .map(([date, values]) => ({
      date,
      value: values.reduce((sum, value) => sum + value, 0) / values.length,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  if (readings.length === 0) return []

  const firstDay = parseISO(readings[0].date)
  const lastReadingDay = readings[readings.length - 1].date
  const parsedThroughDate = throughDate ? parseISO(throughDate) : null
  const parsedLastReadingDay = parseISO(lastReadingDay)
  const lastDay =
    parsedThroughDate &&
    isValid(parsedThroughDate) &&
    parsedThroughDate > parsedLastReadingDay
      ? parsedThroughDate
      : parsedLastReadingDay
  const readingByDate = new Map(readings.map((reading) => [reading.date, reading.value]))
  const points: {
    date: string
    value: number | null
    average: number | null
    sampleCount: number
  }[] = []

  let windowStartIndex = 0
  let windowEndIndex = 0

  for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
    const date = format(day, 'yyyy-MM-dd')
    const windowStart = format(addDays(day, -(windowDays - 1)), 'yyyy-MM-dd')

    while (windowEndIndex < readings.length && readings[windowEndIndex].date <= date) {
      windowEndIndex += 1
    }

    while (
      windowStartIndex < windowEndIndex &&
      readings[windowStartIndex].date < windowStart
    ) {
      windowStartIndex += 1
    }

    const sampleCount = windowEndIndex - windowStartIndex
    const hasFullCalendarWindow =
      differenceInCalendarDays(day, firstDay) >= windowDays - 1
    const average =
      (!requireFullWindow || hasFullCalendarWindow) && sampleCount > 0
        ? windowAverage(readings.slice(windowStartIndex, windowEndIndex))
        : null

    points.push({
      date,
      value: readingByDate.get(date) ?? null,
      average: average == null ? null : round(average, 1),
      sampleCount,
    })
  }

  return points
}

export function buildWeightTrend(
  entries: WeightTrendInput[],
  windowDays: TrendWindowDays = 7,
): WeightTrendPoint[] {
  return buildRollingTrend(
    entries.map((entry) => ({ measured_on: entry.measured_on, value: entry.bodyweight })),
    (value) => value > 0,
    windowDays,
    undefined,
    true,
    waterResistantMean,
  ).map((point) => ({
    date: point.date,
    weight: point.value,
    average: point.average,
    sampleCount: point.sampleCount,
  }))
}

/** Body-fat counterpart to the calendar-day bodyweight trend. */
export function buildBodyFatTrend(
  entries: BodyFatTrendInput[],
  windowDays: TrendWindowDays = 7,
  throughDate?: string,
): BodyFatTrendPoint[] {
  return buildRollingTrend(
    entries.map((entry) => ({ measured_on: entry.measured_on, value: entry.bodyfat_pct })),
    (value) => value > 0 && value <= 100,
    windowDays,
    throughDate,
    false,
  ).map((point) => ({
    date: point.date,
    bodyfat: point.value,
    average: point.average,
    sampleCount: point.sampleCount,
  }))
}

/** Compare the first and last available rolling averages in a selected range. */
export function summarizeWeightTrend(
  points: WeightTrendPoint[],
  startDate?: string,
  endDate?: string,
): WeightTrendSummary {
  const usable = points.filter(
    (point) =>
      point.average != null &&
      (!startDate || point.date >= startDate) &&
      (!endDate || point.date <= endDate),
  )
  const first = usable[0]
  const last = usable[usable.length - 1]

  if (!first || !last) {
    return {
      currentAverage: null,
      startAverage: null,
      change: null,
      percentChange: null,
      weeklyRate: null,
      elapsedDays: 0,
      currentSampleCount: 0,
      direction: 'insufficient',
    }
  }

  const elapsedDays = differenceInCalendarDays(parseISO(last.date), parseISO(first.date))
  if (elapsedDays === 0) {
    return {
      currentAverage: last.average,
      startAverage: first.average,
      change: null,
      percentChange: null,
      weeklyRate: null,
      elapsedDays,
      currentSampleCount: last.sampleCount,
      direction: 'insufficient',
    }
  }

  const rawChange = last.average! - first.average!
  const change = round(rawChange, 1)
  const percentChange = round((rawChange / first.average!) * 100, 2)
  const weeklyRate = round((rawChange * 7) / elapsedDays, 2)
  const direction =
    Math.abs(percentChange) < 0.01 ? 'flat' : rawChange > 0 ? 'up' : 'down'

  return {
    currentAverage: last.average,
    startAverage: first.average,
    change,
    percentChange,
    weeklyRate,
    elapsedDays,
    currentSampleCount: last.sampleCount,
    direction,
  }
}
