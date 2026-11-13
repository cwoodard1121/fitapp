'use client'

import { toast } from 'sonner'

/**
 * Offline write queue. A wrapped server action runs normally when the device
 * is online. When the device is offline, or the request fails at the network
 * level, the call is saved to localStorage and replayed in order once the
 * device is back online.
 */

type Result = { ok: true } | { ok: false; error: string }
type AnyAction = (...args: never[]) => Promise<unknown>

interface QueuedCall {
  id: string
  name: string
  key: string | null
  args: unknown[]
  at: number
  attempts?: number
}

const MAX_ATTEMPTS = 5
const STORAGE_KEY = 'simplegym:offline-queue:v1'
const registry = new Map<string, AnyAction>()
const listeners = new Set<(count: number) => void>()
let flushing: Promise<number> | null = null

function read(): QueuedCall[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? (parsed as QueuedCall[]) : []
  } catch {
    return []
  }
}

function write(queue: QueuedCall[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
  } catch {
    /* storage full or blocked */
  }
  for (const listener of listeners) listener(queue.length)
}

export function pendingOfflineCount(): number {
  if (typeof window === 'undefined') return 0
  return read().length
}

export function onOfflineQueueChange(listener: (count: number) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/** A thrown fetch failure, not an error the server sent back. */
function isNetworkError(error: unknown): boolean {
  if (isOffline()) return true
  if (!(error instanceof Error)) return false
  return (
    error instanceof TypeError ||
    /fetch|network|load failed|connection/i.test(error.message)
  )
}

function enqueue(name: string, key: string | null, args: unknown[]): void {
  const queue = read().filter((call) => key == null || call.key !== key)
  queue.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name,
    key,
    args,
    at: Date.now(),
  })
  write(queue)
}

/**
 * Wrap a server action so it works offline. `keyOf` names the thing the call
 * overwrites (for example one exercise in one session). A newer queued call
 * with the same key replaces the older one.
 */
export function offlineAction<A extends unknown[], R extends Result>(
  name: string,
  action: (...args: A) => Promise<R>,
  keyOf?: (...args: A) => string,
): (...args: A) => Promise<R> {
  registry.set(name, action as unknown as AnyAction)
  return async (...args: A): Promise<R> => {
    const key = keyOf ? `${name}:${keyOf(...args)}` : null
    // Keep order: while older calls wait in the queue, new calls join it.
    if (isOffline() || pendingOfflineCount() > 0) {
      enqueue(name, key, args)
      if (!isOffline()) void flushOfflineQueue()
      return { ok: true } as R
    }
    try {
      return await action(...args)
    } catch (error) {
      if (!isNetworkError(error)) throw error
      enqueue(name, key, args)
      return { ok: true } as R
    }
  }
}

/** Replay queued calls in order. Returns how many calls reached the server. */
export function flushOfflineQueue(): Promise<number> {
  if (flushing) return flushing
  flushing = (async () => {
    let sent = 0
    while (!isOffline()) {
      const queue = read()
      const next = queue[0]
      if (!next) break
      const action = registry.get(next.name)
      if (!action) {
        // The module that owns this action has not loaded yet.
        break
      }
      try {
        const res = (await (action as (...args: unknown[]) => Promise<unknown>)(
          ...next.args,
        )) as Partial<{ ok: boolean; error: string }> | undefined
        if (res && res.ok === false && /session expired|sign in/i.test(res.error ?? '')) {
          // Keep the change until you sign in again.
          toast.error('Sign in again to sync your offline changes.')
          break
        }
        if (res && res.ok === false) {
          toast.error(`An offline change did not sync: ${res.error ?? 'unknown error'}`)
        } else {
          sent += 1
        }
      } catch (error) {
        if (isNetworkError(error)) break
        // Keep the change and retry later. Give up after MAX_ATTEMPTS tries.
        const attempts = (next.attempts ?? 0) + 1
        if (attempts < MAX_ATTEMPTS) {
          write(read().map((call) => (call.id === next.id ? { ...call, attempts } : call)))
          break
        }
        console.error('Offline replay failed', next.name, error)
        toast.error('An offline change did not sync after several tries.')
      }
      write(read().filter((call) => call.id !== next.id))
    }
    return sent
  })().finally(() => {
    flushing = null
  })
  return flushing
}
