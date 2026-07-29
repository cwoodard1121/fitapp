export interface VolumeIncreaseCandidate {
  /** Upcoming session/day + normalized muscle area. */
  groupKey: string
  /** Lower pump wins when more than one exercise qualifies. */
  pump: number | null
}

/**
 * Allow at most one set increase per muscle in the upcoming workout. Candidate
 * order is the stable program-order tie breaker.
 */
export function chooseVolumeIncreaseWinners(
  candidates: Array<VolumeIncreaseCandidate | null>,
): Set<number> {
  const winnerByGroup = new Map<string, number>()

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]
    if (!candidate) continue
    const existingIndex = winnerByGroup.get(candidate.groupKey)
    if (existingIndex == null) {
      winnerByGroup.set(candidate.groupKey, index)
      continue
    }

    const existingPump = candidates[existingIndex]?.pump ?? Infinity
    const candidatePump = candidate.pump ?? Infinity
    if (candidatePump < existingPump) {
      winnerByGroup.set(candidate.groupKey, index)
    }
  }

  return new Set(winnerByGroup.values())
}
