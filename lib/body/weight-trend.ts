import { addDays, differenceInCalendarDays, format, isValid, parseISO } from 'date-fns'

export interface WeightTrendInput {
  measured_on: string
  bodyweight: number | null
}

export interface WeightTrendPoint {
  /** ISO calendar date. */
  date: string
  /** The scale reading for this day, or null when no weigh-in was logged. */
  weight: number | null
  /** Trailing average for this date and the six calendar days before it. */
  average: number | null
  /** Number of logged days represented by the average. */
  sampleCount: number
}

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
  weight: number
}

const round = (value: number, precision: number) => {
  const scale = 10 ** precision
  return Math.round((value + Number.EPSILON) * scale) / scale
}

/**
 * Build a trailing seven-calendar-day series.
 *
 * The previous chart averaged the last seven *entries*. That can cover far more
 * than seven days when weigh-ins are missed. This implementation uses the date
 * interval [day - 6, day], averages duplicate same-day readings first, and only
 * exposes the rolling value after a full seven-day calendar window has elapsed.
 */
export function buildSevenDayWeightTrend(
  entries: WeightTrendInput[],
): WeightTrendPoint[] {
  const weightsByDate = new Map<string, number[]>()

  for (const entry of entries) {
    if (
      entry.bodyweight == null ||
      !Number.isFinite(entry.bodyweight) ||
      entry.bodyweight <= 0
    ) {
      continue
    }

    const parsed = parseISO(entry.measured_on)
    if (!isValid(parsed)) continue
    const date = format(parsed, 'yyyy-MM-dd')
    const existing = weightsByDate.get(date) ?? []
    existing.push(entry.bodyweight)
    weightsByDate.set(date, existing)
  }

  const readings: DailyReading[] = [...weightsByDate]
    .map(([date, weights]) => ({
      date,
      weight: weights.reduce((sum, weight) => sum + weight, 0) / weights.length,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  if (readings.length === 0) return []

  const firstDay = parseISO(readings[0].date)
  const lastDay = parseISO(readings[readings.length - 1].date)
  const readingByDate = new Map(readings.map((reading) => [reading.date, reading.weight]))
  const points: WeightTrendPoint[] = []

  let windowStartIndex = 0
  let windowEndIndex = 0
  let windowSum = 0

  for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
    const date = format(day, 'yyyy-MM-dd')
    const windowStart = format(addDays(day, -6), 'yyyy-MM-dd')

    while (windowEndIndex < readings.length && readings[windowEndIndex].date <= date) {
      windowSum += readings[windowEndIndex].weight
      windowEndIndex += 1
    }

    while (
      windowStartIndex < windowEndIndex &&
      readings[windowStartIndex].date < windowStart
    ) {
      windowSum -= readings[windowStartIndex].weight
      windowStartIndex += 1
    }

    const sampleCount = windowEndIndex - windowStartIndex
    const hasFullCalendarWindow = differenceInCalendarDays(day, firstDay) >= 6

    points.push({
      date,
      weight: readingByDate.get(date) ?? null,
      average:
        hasFullCalendarWindow && sampleCount > 0
          ? round(windowSum / sampleCount, 1)
          : null,
      sampleCount,
    })
  }

  return points
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
