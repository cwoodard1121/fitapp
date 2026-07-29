'use client'

const pendingSavesByKey = new Map<string, Set<Promise<boolean>>>()
const failedSaveKeys = new Set<string>()
const retryByKey = new Map<string, () => Promise<boolean>>()
const inactiveRetryKeys = new Set<string>()
const logicalKeyByInstance = new Map<string, string>()
const saveTailByLogicalKey = new Map<string, Promise<boolean>>()
const latestAttemptByLogicalKey = new Map<string, number>()

function releaseInactiveRetry(key: string): void {
  if (
    inactiveRetryKeys.has(key) &&
    !failedSaveKeys.has(key) &&
    (pendingSavesByKey.get(key)?.size ?? 0) === 0
  ) {
    retryByKey.delete(key)
    inactiveRetryKeys.delete(key)
    logicalKeyByInstance.delete(key)
  }
}

function belongsToSession(key: string, sessionPrefix: string): boolean {
  return (logicalKeyByInstance.get(key) ?? key).startsWith(sessionPrefix)
}

/**
 * Serialize saves for one logical session/exercise across React remounts.
 * Registering a newer snapshot supersedes older failed drafts; the older
 * request still settles first, so it can never overwrite the newer write.
 */
export function enqueueTrainingSave(
  key: string,
  logicalKey: string,
  save: () => Promise<boolean>,
): Promise<boolean> {
  logicalKeyByInstance.set(key, logicalKey)
  const attempt = (latestAttemptByLogicalKey.get(logicalKey) ?? 0) + 1
  latestAttemptByLogicalKey.set(logicalKey, attempt)

  // Once a newer snapshot is queued, an older failed draft must never be
  // retried over it. In-flight older writes remain in the shared tail and
  // therefore finish before this save begins.
  for (const [candidate, candidateLogicalKey] of logicalKeyByInstance) {
    if (candidateLogicalKey !== logicalKey) continue
    failedSaveKeys.delete(candidate)
    if (candidate !== key) releaseInactiveRetry(candidate)
  }

  const previous = saveTailByLogicalKey.get(logicalKey) ?? Promise.resolve(true)
  const run = previous.then(save, save)
  const tracked = run.then(
    (ok) => {
      if (latestAttemptByLogicalKey.get(logicalKey) === attempt) {
        if (ok) failedSaveKeys.delete(key)
        else failedSaveKeys.add(key)
      }
      return ok
    },
    () => {
      if (latestAttemptByLogicalKey.get(logicalKey) === attempt) {
        failedSaveKeys.add(key)
      }
      return false
    },
  )
  saveTailByLogicalKey.set(logicalKey, tracked)

  const pendingForKey = pendingSavesByKey.get(key) ?? new Set()
  pendingForKey.add(tracked)
  pendingSavesByKey.set(key, pendingForKey)
  void tracked.finally(() => {
    const current = pendingSavesByKey.get(key)
    current?.delete(tracked)
    if (current?.size === 0) pendingSavesByKey.delete(key)
    if (saveTailByLogicalKey.get(logicalKey) === tracked) {
      saveTailByLogicalKey.delete(logicalKey)
    }
    releaseInactiveRetry(key)
  })

  return tracked
}

/**
 * Register the latest dirty snapshot for one mounted slot. Finish can retry a
 * failed blur save without requiring the athlete to touch that input again.
 */
export function registerTrainingSaveRetry(
  key: string,
  logicalKey: string,
  retry: () => Promise<boolean>,
): () => void {
  logicalKeyByInstance.set(key, logicalKey)
  inactiveRetryKeys.delete(key)
  retryByKey.set(key, retry)
  return () => {
    if (retryByKey.get(key) !== retry) return
    inactiveRetryKeys.add(key)
    // Keep the callback if a save is in flight or failed. It owns the dirty
    // snapshot and can safely retry if no newer snapshot supersedes it.
    releaseInactiveRetry(key)
  }
}

/**
 * Wait for this session's saves, retry its failed newest snapshots once, and
 * refuse completion until every exercise has genuinely persisted.
 */
export async function flushTrainingSaves(sessionId: string): Promise<boolean> {
  const sessionPrefix = `${sessionId}:`
  const waitForSessionSaves = async () => {
    while (true) {
      const pending = [...pendingSavesByKey.entries()]
        .filter(([key]) => belongsToSession(key, sessionPrefix))
        .flatMap(([, saves]) => [...saves])
      if (pending.length === 0) return
      await Promise.all(pending)
    }
  }
  await waitForSessionSaves()

  const failedForSession = () =>
    [...failedSaveKeys].filter((key) => belongsToSession(key, sessionPrefix))
  const retries = failedForSession()
    .map((key) => retryByKey.get(key))
    .filter((retry): retry is () => Promise<boolean> => retry != null)
  if (retries.length > 0) {
    await Promise.all(retries.map((retry) => retry()))
    await waitForSessionSaves()
  }

  return failedForSession().length === 0
}
