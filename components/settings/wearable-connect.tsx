'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'
import { Activity, RefreshCw, Plug, Unplug, AlertTriangle } from 'lucide-react'

import type { RecoveryMetric, WearableStatus } from '@/lib/types'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui'
import { disconnectWearable, syncWearableNow } from '@/app/(app)/settings/wearable-actions'

export interface WearableConnectData {
  connected: boolean
  status: WearableStatus | null
  lastSynced: string | null
  recent: RecoveryMetric[]
}

const CONNECT_HREF = '/api/wearables/google/connect'

/**
 * WearableConnect — connect/sync/disconnect a Fitbit via the Google Health API,
 * and show the most recent imported steps + sleep. Calorie data is never
 * imported by design. Allowlisted accounts only (the Settings page gates it).
 */
export function WearableConnect({ data }: { data: WearableConnectData }) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()

  // Surface the OAuth redirect outcome once, then clean the query string.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const flag = params.get('wearable')
    if (!flag) return
    const messages: Record<string, () => void> = {
      connected: () => toast.success('Fitbit connected — pulling your steps & sleep.'),
      denied: () => toast.error('Connection cancelled.'),
      error: () => toast.error('Could not connect — please try again.'),
      config: () => toast.error('Wearable sync isn’t configured on the server yet.'),
    }
    ;(messages[flag] ?? (() => {}))()
    router.replace('/settings')
  }, [router])

  function handleSync() {
    startTransition(async () => {
      const res = await syncWearableNow()
      if (res.ok) {
        toast.success(`Synced — ${res.daysWritten ?? 0} day${res.daysWritten === 1 ? '' : 's'} updated.`)
        router.refresh()
      } else {
        toast.error(res.error)
        if (res.reauthRequired) router.refresh()
      }
    })
  }

  function handleDisconnect() {
    startTransition(async () => {
      const res = await disconnectWearable()
      if (res.ok) {
        toast.success('Fitbit disconnected. Your imported data is kept.')
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="size-4 text-signal" aria-hidden />
          Wearable sync
        </CardTitle>
        <CardDescription>
          Pull your daily <strong>steps</strong> and <strong>sleep</strong> from Fitbit via
          the Google Health API. Calories are never imported.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!data.connected ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Connect once, then hit <strong>Sync</strong> whenever you want to pull your
              latest steps and sleep. You’ll sign in with the Google account your Fitbit is
              linked to.
            </p>
            <Button asChild>
              <a href={CONNECT_HREF}>
                <Plug className="size-4" aria-hidden />
                Connect Fitbit (Google Health)
              </a>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {data.status === 'reauth_required' ? (
              <div className="flex items-start gap-2 rounded-md border border-gate-yellow/40 bg-gate-yellow/10 p-2.5 text-sm text-gate-yellow">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  Connection expired — reconnect to resume syncing.
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted">
                Connected.{' '}
                {data.lastSynced
                  ? `Last synced ${format(parseISO(data.lastSynced), "MMM d 'at' h:mm a")}.`
                  : 'Waiting for the first sync.'}
              </p>
            )}

            <RecentRecovery rows={data.recent} />

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handleSync} disabled={pending}>
                <RefreshCw className={`size-3.5 ${pending ? 'animate-spin' : ''}`} aria-hidden />
                Sync now
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={CONNECT_HREF}>
                  <Plug className="size-3.5" aria-hidden />
                  Reconnect
                </a>
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDisconnect} disabled={pending}>
                <Unplug className="size-3.5" aria-hidden />
                Disconnect
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function RecentRecovery({ rows }: { rows: RecoveryMetric[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-border bg-background p-3 text-sm text-muted">
        No data yet. It can take a sync cycle (and a night’s sleep) to populate.
      </p>
    )
  }
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-background text-[11px] uppercase tracking-wider text-muted">
            <th className="px-3 py-2 text-left font-medium">Day</th>
            <th className="px-3 py-2 text-right font-medium">Steps</th>
            <th className="px-3 py-2 text-right font-medium">Sleep</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border last:border-0">
              <td className="px-3 py-2 text-foreground">{formatDay(r.metric_date)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-foreground">
                {r.steps != null ? r.steps.toLocaleString() : '—'}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-foreground">
                {formatSleep(r.sleep_minutes_asleep)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function formatDay(date: string): string {
  try {
    return format(parseISO(date), 'EEE M/d')
  } catch {
    return date
  }
}

function formatSleep(minutes: number | null): string {
  if (minutes == null) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m}m`
}
