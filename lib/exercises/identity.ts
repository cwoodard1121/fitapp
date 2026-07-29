/**
 * Historical names that should share one progression stream.
 *
 * Program resets intentionally keep the old slots and logs for history. This
 * alias table lets a newly named slot inherit those logs without rewriting the
 * historical display text or coupling progress to a slot/program id.
 */
const EXERCISE_NAME_ALIASES: Readonly<Record<string, string>> = {
  'bench press': 'barbell bench press',
  'touch-and-go bench': 'barbell bench press',
  'touch and go bench': 'barbell bench press',
  'db incline bench': 'incline dumbbell bench press',
  'incline db press': 'incline dumbbell bench press',
  'incline dumbbell press': 'incline dumbbell bench press',
  'pull up': 'pull-up',
  pullup: 'pull-up',
  'pull-up or pulldown': 'pull-up',
  row: 'barbell row',
  rows: 'barbell row',
  'barbell rows': 'barbell row',
  'db lateral raise': 'dumbbell lateral raise',
  'seated lateral raise': 'seated dumbbell lateral raise',
  'barbell wrist curl': 'dumbbell wrist curl',
  'wrist curl': 'dumbbell wrist curl',
  'barbell curl': 'ez-bar curl',
  'ez bar curl': 'ez-bar curl',
  pushdown: 'triceps pushdown',
  'reverse curl': 'cable reverse curl',
  squat: 'barbell squat',
  'barbell back squat': 'barbell squat',
  'incline curl': 'incline dumbbell curl',
  'incline db curl': 'incline dumbbell curl',
  skullcrusher: 'skull crusher',
}

function normalizedExerciseName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
}

/** Canonical key used wherever exercise history is grouped or looked up. */
export function exerciseNameKey(name: string): string {
  const normalized = normalizedExerciseName(name)
  return EXERCISE_NAME_ALIASES[normalized] ?? normalized
}

/** First unused generated slot code for a program day (safe after deletions/gaps). */
export function nextGeneratedSlotCode(dayNumber: number, existingCodes: string[]): string {
  const used = new Set(existingCodes.map((code) => code.trim().toLocaleLowerCase('en-US')))
  let sequence = 1
  while (used.has(`d${dayNumber}a${sequence}`)) sequence += 1
  return `D${dayNumber}A${sequence}`
}
