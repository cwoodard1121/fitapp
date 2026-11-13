'use client'

import * as React from 'react'
import { toast } from 'sonner'

import '@/lib/client/offline-actions'
import {
  flushOfflineQueue,
  onOfflineQueueChange,
  pendingOfflineCount,
} from '@/lib/client/offline-queue'

/**
 * Pushes changes saved offline once the device reconnects, and shows a small
 * badge with the number of changes still waiting.
 */
export function OfflineSync() {
  const [pending, setPending] = React.useState(0)
  const [offline, setOffline] = React.useState(false)

  React.useEffect(() => {
    setPending(pendingOfflineCount())
    setOffline(navigator.onLine === false)
    const stop = onOfflineQueueChange(setPending)

    const flush = async () => {
      if (pendingOfflineCount() === 0) return
      const sent = await flushOfflineQueue()
      if (sent > 0) {
        toast.success(`Synced ${sent} offline change${sent === 1 ? '' : 's'}.`)
      }
    }
    const goOnline = () => {
      setOffline(false)
      void flush()
    }
    const goOffline = () => {
      setOffline(true)
      toast('You are offline. Changes save on this device and sync later.')
    }

    void flush()
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    const visible = () => {
      if (document.visibilityState === 'visible') void flush()
    }
    document.addEventListener('visibilitychange', visible)
    const timer = window.setInterval(() => void flush(), 30_000)
    return () => {
      stop()
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      document.removeEventListener('visibilitychange', visible)
      window.clearInterval(timer)
    }
  }, [])

  if (!offline && pending === 0) return null
  return (
    <div
      role="status"
      className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top)+0.5rem)] z-50 -translate-x-1/2 rounded-full border border-border bg-surface/95 px-3 py-1 font-mono text-xs font-semibold text-muted shadow-sm backdrop-blur-md">
      {offline ? 'offline' : 'syncing'}
      {pending > 0 ? ` · ${pending} waiting` : ''}
    </div>
  )
}
