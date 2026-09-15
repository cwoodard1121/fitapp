'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

import { autoSyncWearableIfDue } from '@/app/(app)/settings/wearable-actions'

/**
 * Silent background Fitbit sync fired once when the app shell mounts — i.e.
 * every fresh open (cold load or PWA relaunch), not on every in-app
 * navigation, since this lives in the shared authenticated layout and layouts
 * persist across client-side route changes. No UI of its own: no toast on
 * success (this should feel automatic, like a native health app), and
 * failures stay silent here too — Settings already surfaces connection
 * problems for whoever wants to look. Only refreshes the route when new data
 * actually landed, so an already-fresh session sees no flicker.
 */
export function WearableAutoSync() {
  const router = useRouter()
  const firedRef = useRef(false)

  useEffect(() => {
    if (firedRef.current) return
    firedRef.current = true

    let cancelled = false
    autoSyncWearableIfDue()
      .then((res) => {
        if (!cancelled && res.ok && (res.daysWritten ?? 0) > 0) {
          router.refresh()
        }
      })
      .catch(() => {
        /* silent — background convenience, not a user-facing action */
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
