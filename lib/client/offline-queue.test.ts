import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }))

const store = new Map<string, string>()
let online = true
vi.stubGlobal('window', {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  },
})
vi.stubGlobal('navigator', {
  get onLine() {
    return online
  },
})

const { offlineAction, flushOfflineQueue, pendingOfflineCount } = await import('./offline-queue')

describe('offline queue', () => {
  beforeEach(() => {
    store.clear()
    online = true
  })

  it('queues offline calls, keeps the newest per key, and replays in order', async () => {
    const calls: string[] = []
    const save = offlineAction(
      'testSave',
      async (input: { id: string; v: number }) => {
        calls.push(`${input.id}=${input.v}`)
        return { ok: true as const }
      },
      (input) => input.id,
    )
    online = false
    await save({ id: 'a', v: 1 })
    await save({ id: 'b', v: 1 })
    await save({ id: 'a', v: 2 })
    expect(calls).toEqual([])
    expect(pendingOfflineCount()).toBe(2)

    online = true
    expect(await flushOfflineQueue()).toBe(2)
    expect(calls).toEqual(['b=1', 'a=2'])
    expect(pendingOfflineCount()).toBe(0)
  })

  it('keeps a change when replay throws an unknown error', async () => {
    let fail = true
    const save = offlineAction('testThrow', async (_input: { id: string }) => {
      if (fail) throw new Error('An unexpected response was received from the server.')
      return { ok: true as const }
    })
    online = false
    await save({ id: 'x' })
    online = true
    expect(await flushOfflineQueue()).toBe(0)
    expect(pendingOfflineCount()).toBe(1)
    fail = false
    expect(await flushOfflineQueue()).toBe(1)
    expect(pendingOfflineCount()).toBe(0)
  })
})
