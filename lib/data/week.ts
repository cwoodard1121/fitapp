/**
 * Mesocycle week math. The "current week" is derived from the program start
 * date (profiles.start_date) so the Today view always opens on the right week,
 * and mesocycles repeat: week cycles 1..length_weeks.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000
const DEFAULT_TIME_ZONE =
  process.env.APP_TIME_ZONE || 'America/Toronto'

function plainDateOrdinal(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const utc = Date.UTC(year, month - 1, day)
  const parsed = new Date(utc)
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null
  }
  return Math.floor(utc / MS_PER_DAY)
}

function zonedDateOrdinal(date: Date, timeZone: string): number | null {
  if (Number.isNaN(date.getTime())) return null
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date)
    const byType = new Map(parts.map((part) => [part.type, part.value]))
    return plainDateOrdinal(
      `${byType.get('year')}-${byType.get('month')}-${byType.get('day')}`,
    )
  } catch {
    return null
  }
}

function completedWeeks(
  startDate: string,
  today: Date,
  timeZone: string,
): number | null {
  const start = plainDateOrdinal(startDate)
  const current = zonedDateOrdinal(today, timeZone)
  if (start == null || current == null) return null
  if (current < start) return 0
  return Math.floor((current - start) / 7)
}

/**
 * Which mesocycle week a date falls in, given the program start date and length.
 *  - No start date yet -> week 1 (calibration).
 *  - Before the start date -> week 1.
 *  - Otherwise cycles 1..lengthWeeks as weeks elapse.
 */
export function weekForDate(
  startDate: string | null | undefined,
  lengthWeeks: number,
  today: Date = new Date(),
  timeZone: string = DEFAULT_TIME_ZONE,
): number {
  if (!startDate) return 1
  const weeksElapsed = completedWeeks(startDate, today, timeZone)
  if (weeksElapsed == null) return 1
  const len = Math.max(1, lengthWeeks)
  return (weeksElapsed % len) + 1
}

/** How many whole mesocycles have completed since the start date (0-based). */
export function mesocycleNumber(
  startDate: string | null | undefined,
  lengthWeeks: number,
  today: Date = new Date(),
  timeZone: string = DEFAULT_TIME_ZONE,
): number {
  if (!startDate) return 0
  const weeksElapsed = completedWeeks(startDate, today, timeZone)
  if (weeksElapsed == null) return 0
  const len = Math.max(1, lengthWeeks)
  return Math.floor(weeksElapsed / len)
}
