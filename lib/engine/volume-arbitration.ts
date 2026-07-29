export interface VolumeIncreaseCandidate {
  /** Completed session + normalized muscle area. */
  exposureKey: string
  /** Lower pump wins when more than one exercise qualifies. */
  pump: number | null
}

/**
 * Allow at most one set increase per muscle exposure. Candidate order is the
 * stable program-order tie breaker.
 */
export function chooseVolumeIncreaseWinners(
  candidates: Array<VolumeIncreaseCandidate | null>,
): Set<number> {
  const winnerByExposure = new Map<string, number>()

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]
    if (!candidate) continue
    const existingIndex = winnerByExposure.get(candidate.exposureKey)
    if (existingIndex == null) {
      winnerByExposure.set(candidate.exposureKey, index)
      continue
    }

    const existingPump = candidates[existingIndex]?.pump ?? Infinity
    const candidatePump = candidate.pump ?? Infinity
    if (candidatePump < existingPump) {
      winnerByExposure.set(candidate.exposureKey, index)
    }
  }

  return new Set(winnerByExposure.values())
}
