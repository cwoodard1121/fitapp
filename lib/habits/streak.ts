const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

export interface HabitStreakSummary {
  completedToday: boolean
  currentStreak: number
  bestStreak: number
  totalCompletions: number
}

/**
 * Convert a strict calendar date to a UTC day ordinal.
 *
 * UTC is used only as a stable representation for date-only arithmetic. It
 * avoids daylight-saving transitions changing the distance between two dates.
 */
function dateOrdinal(value: string): number | null {
  const match = DATE_ONLY_PATTERN.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null

  // Start from a year outside JavaScript's special 0-99 constructor handling,
  // then set the requested year explicitly.
  const date = new Date(Date.UTC(2000, month - 1, day))
  date.setUTCFullYear(year)

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return Math.floor(date.getTime() / MILLISECONDS_PER_DAY)
}

/** Inverse of `dateOrdinal` — a UTC day ordinal back to `yyyy-MM-dd`. */
function ordinalToDate(ordinal: number): string {
  const date = new Date(ordinal * MILLISECONDS_PER_DAY)
  const year = String(date.getUTCFullYear()).padStart(4, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Calculate daily habit streaks from completed `yyyy-MM-dd` calendar dates.
 *
 * Invalid dates, future dates, and duplicate dates do not contribute. The
 * current streak ends today when today is complete; otherwise it ends
 * yesterday so the streak remains intact while today's completion is pending.
 */
export function calculateHabitStreak(
  completedDates: readonly string[],
  today: string,
): HabitStreakSummary {
  const todayOrdinal = dateOrdinal(today)
  if (todayOrdinal == null) {
    throw new RangeError('today must be a valid yyyy-MM-dd date')
  }

  const completed = new Set<number>()
  for (const value of completedDates) {
    const ordinal = dateOrdinal(value)
    if (ordinal != null && ordinal <= todayOrdinal) completed.add(ordinal)
  }

  const sorted = [...completed].sort((a, b) => a - b)
  let bestStreak = 0
  let runLength = 0
  let previous: number | null = null

  for (const ordinal of sorted) {
    runLength = previous != null && ordinal === previous + 1 ? runLength + 1 : 1
    bestStreak = Math.max(bestStreak, runLength)
    previous = ordinal
  }

  const completedToday = completed.has(todayOrdinal)
  const anchor = completedToday ? todayOrdinal : todayOrdinal - 1
  let currentStreak = 0
  while (completed.has(anchor - currentStreak)) currentStreak += 1

  return {
    completedToday,
    currentStreak,
    bestStreak,
    totalCompletions: completed.size,
  }
}

export interface RecentDay {
  date: string
  completed: boolean
}

/**
 * The last `windowDays` calendar days ending today (inclusive), oldest
 * first, each marked complete or not. Backs the per-habit backfill strip —
 * tapping any of these days toggles that day's completion directly, not
 * just today's.
 */
export function recentCompletionStrip(
  completedDates: readonly string[],
  today: string,
  windowDays: number,
): RecentDay[] {
  const todayOrdinal = dateOrdinal(today)
  if (todayOrdinal == null) {
    throw new RangeError('today must be a valid yyyy-MM-dd date')
  }

  const completed = new Set<number>()
  for (const value of completedDates) {
    const ordinal = dateOrdinal(value)
    if (ordinal != null && ordinal <= todayOrdinal) completed.add(ordinal)
  }

  const days: RecentDay[] = []
  for (let i = windowDays - 1; i >= 0; i--) {
    const ordinal = todayOrdinal - i
    days.push({ date: ordinalToDate(ordinal), completed: completed.has(ordinal) })
  }
  return days
}

/**
 * Count of completions within the last `windowDays` calendar days ending
 * today (inclusive) — the numerator for an optional weekly goal like "3/5
 * this week."
 */
export function countRecentCompletions(
  completedDates: readonly string[],
  today: string,
  windowDays: number,
): number {
  return recentCompletionStrip(completedDates, today, windowDays).filter(
    (d) => d.completed,
  ).length
}
