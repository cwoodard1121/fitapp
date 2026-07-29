import { describe, expect, it } from 'vitest'

import {
  enqueueTrainingSave,
  flushTrainingSaves,
  registerTrainingSaveRetry,
} from './training-save-queue'

describe('training save queue', () => {
  it('waits for an in-flight autosave before allowing completion', async () => {
    const sessionId = 'session-wait'
    const key = `${sessionId}:slot:mount`
    const logicalKey = `${sessionId}:slot`
    let finishSave: ((ok: boolean) => void) | undefined
    const save = new Promise<boolean>((resolve) => {
      finishSave = resolve
    })
    void enqueueTrainingSave(key, logicalKey, () => save)

    let flushed = false
    const flush = flushTrainingSaves(sessionId).then((ok) => {
      flushed = true
      return ok
    })
    await Promise.resolve()
    expect(flushed).toBe(false)

    finishSave?.(true)
    await expect(flush).resolves.toBe(true)
  })

  it('keeps a failed slot blocking until that slot saves successfully', async () => {
    const sessionId = 'session-sticky-failure'
    const key = `${sessionId}:slot:mount`
    const logicalKey = `${sessionId}:slot`
    await enqueueTrainingSave(key, logicalKey, () => Promise.resolve(false))

    await expect(flushTrainingSaves(sessionId)).resolves.toBe(false)
    await expect(flushTrainingSaves(sessionId)).resolves.toBe(false)

    await enqueueTrainingSave(key, logicalKey, () => Promise.resolve(true))
    await expect(flushTrainingSaves(sessionId)).resolves.toBe(true)
  })

  it('retries a failed dirty slot while finishing', async () => {
    const sessionId = 'session-retry'
    const key = `${sessionId}:slot:mount`
    const logicalKey = `${sessionId}:slot`
    await enqueueTrainingSave(key, logicalKey, () => Promise.resolve(false))
    let retryCount = 0
    const unregister = registerTrainingSaveRetry(key, logicalKey, () => {
      retryCount += 1
      return enqueueTrainingSave(key, logicalKey, () => Promise.resolve(true))
    })

    await expect(flushTrainingSaves(sessionId)).resolves.toBe(true)
    expect(retryCount).toBe(1)
    unregister()
  })

  it('does not let another session failure block this session', async () => {
    await enqueueTrainingSave(
      'other-session:slot:mount',
      'other-session:slot',
      () => Promise.resolve(false),
    )
    await expect(flushTrainingSaves('clean-session')).resolves.toBe(true)
  })

  it('does not wait for another session in-flight save', async () => {
    let finishOther: ((ok: boolean) => void) | undefined
    const otherSave = new Promise<boolean>((resolve) => {
      finishOther = resolve
    })
    void enqueueTrainingSave(
      'pending-other-session:slot:mount',
      'pending-other-session:slot',
      () => otherSave,
    )

    await expect(flushTrainingSaves('independent-session')).resolves.toBe(true)
    finishOther?.(true)
    await otherSave
  })

  it('retains a failed retry after its slot unmounts', async () => {
    const sessionId = 'session-unmounted-retry'
    const key = `${sessionId}:retired-slot:mount`
    const logicalKey = `${sessionId}:retired-slot`
    let retryCount = 0
    const unregister = registerTrainingSaveRetry(key, logicalKey, () => {
      retryCount += 1
      return enqueueTrainingSave(key, logicalKey, () => Promise.resolve(true))
    })
    await enqueueTrainingSave(key, logicalKey, () => Promise.resolve(false))
    unregister()

    await expect(flushTrainingSaves(sessionId)).resolves.toBe(true)
    expect(retryCount).toBe(1)
  })

  it('keeps an old failed retry when a remount has not saved anything newer', async () => {
    const sessionId = 'session-remounted-retry'
    const logicalKey = `${sessionId}:slot`
    const oldKey = `${logicalKey}:old-mount`
    const newKey = `${logicalKey}:new-mount`
    let oldRetries = 0
    let newRetries = 0
    const unregisterOld = registerTrainingSaveRetry(oldKey, logicalKey, () => {
      oldRetries += 1
      return enqueueTrainingSave(oldKey, logicalKey, () => Promise.resolve(true))
    })
    await enqueueTrainingSave(oldKey, logicalKey, () => Promise.resolve(false))
    unregisterOld()
    registerTrainingSaveRetry(newKey, logicalKey, async () => {
      newRetries += 1
      return true
    })

    await expect(flushTrainingSaves(sessionId)).resolves.toBe(true)
    expect(oldRetries).toBe(1)
    expect(newRetries).toBe(0)
  })

  it('lets a newer remount save supersede an old failed draft', async () => {
    const sessionId = 'session-remount-supersession'
    const logicalKey = `${sessionId}:slot`
    const oldKey = `${logicalKey}:old-mount`
    const newKey = `${logicalKey}:new-mount`
    let oldRetries = 0
    const unregisterOld = registerTrainingSaveRetry(oldKey, logicalKey, () => {
      oldRetries += 1
      return enqueueTrainingSave(oldKey, logicalKey, () => Promise.resolve(true))
    })
    await enqueueTrainingSave(oldKey, logicalKey, () => Promise.resolve(false))
    unregisterOld()

    await enqueueTrainingSave(newKey, logicalKey, () => Promise.resolve(true))
    await expect(flushTrainingSaves(sessionId)).resolves.toBe(true)
    expect(oldRetries).toBe(0)
  })

  it('serializes in-flight saves across remounts so the newest write is last', async () => {
    const sessionId = 'session-remount-order'
    const logicalKey = `${sessionId}:slot`
    const writes: string[] = []
    let releaseOld: (() => void) | undefined
    const oldGate = new Promise<void>((resolve) => {
      releaseOld = resolve
    })
    const oldSave = enqueueTrainingSave(
      `${logicalKey}:old-mount`,
      logicalKey,
      async () => {
        await oldGate
        writes.push('old')
        return true
      },
    )
    const newSave = enqueueTrainingSave(
      `${logicalKey}:new-mount`,
      logicalKey,
      async () => {
        writes.push('new')
        return true
      },
    )

    await Promise.resolve()
    expect(writes).toEqual([])
    releaseOld?.()
    await Promise.all([oldSave, newSave])
    expect(writes).toEqual(['old', 'new'])
  })
})
