/** Canonical key used wherever exercise history is grouped or looked up. */
export function exerciseNameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
}

/** First unused generated slot code for a program day (safe after deletions/gaps). */
export function nextGeneratedSlotCode(dayNumber: number, existingCodes: string[]): string {
  const used = new Set(existingCodes.map((code) => code.trim().toLocaleLowerCase('en-US')))
  let sequence = 1
  while (used.has(`d${dayNumber}a${sequence}`)) sequence += 1
  return `D${dayNumber}A${sequence}`
}
