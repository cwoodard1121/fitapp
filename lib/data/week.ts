/**
 * Mesocycle week math. The "current week" is derived from the program start
 * date (profiles.start_date) so the Today view always opens on the right week,
 * and mesocycles repeat: week cycles 1..length_weeks.
 */

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

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
): number {
  if (!startDate) return 1
  const start = new Date(`${startDate.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(start.getTime())) return 1
  const ms = today.getTime() - start.getTime()
  if (ms < 0) return 1
  const len = Math.max(1, lengthWeeks)
  const weeksElapsed = Math.floor(ms / MS_PER_WEEK)
  return (weeksElapsed % len) + 1
}

/** How many whole mesocycles have completed since the start date (0-based). */
export function mesocycleNumber(
  startDate: string | null | undefined,
  lengthWeeks: number,
  today: Date = new Date(),
): number {
  if (!startDate) return 0
  const start = new Date(`${startDate.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(start.getTime())) return 0
  const ms = today.getTime() - start.getTime()
  if (ms < 0) return 0
  const len = Math.max(1, lengthWeeks)
  return Math.floor(Math.floor(ms / MS_PER_WEEK) / len)
}
