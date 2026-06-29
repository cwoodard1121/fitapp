import { format, parseISO } from 'date-fns'
import { Footprints, Moon, HeartPulse, Activity } from 'lucide-react'

import type { RecoveryMetric } from '@/lib/types'

/** Format minutes as "7h 32m" (or "—"). */
function sleepLabel(minutes: number | null): string {
  if (minutes == null) return '—'
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function dayLabel(date: string): string {
  try {
    const todayIso = format(new Date(), 'yyyy-MM-dd')
    if (date === todayIso) return 'Today'
    return format(parseISO(date), 'EEE, MMM d')
  } catch {
    return date
  }
}

/**
 * RecoveryStrip — a compact wearable readout for the Today screen: the most
 * recent day's steps + sleep (plus resting HR / HRV when present). Presentational;
 * the page passes the latest RecoveryMetric and gates on the allowlist.
 */
export function RecoveryStrip({ metric }: { metric: RecoveryMetric }) {
  const tiles: { icon: typeof Footprints; label: string; value: string; sub?: string }[] = [
    {
      icon: Footprints,
      label: 'Steps',
      value: metric.steps != null ? metric.steps.toLocaleString() : '—',
    },
    {
      icon: Moon,
      label: 'Sleep',
      value: sleepLabel(metric.sleep_minutes_asleep),
    },
  ]
  if (metric.resting_hr != null) {
    tiles.push({ icon: HeartPulse, label: 'Rest HR', value: `${metric.resting_hr}`, sub: 'bpm' })
  }
  if (metric.hrv_ms != null) {
    tiles.push({ icon: Activity, label: 'HRV', value: `${Math.round(metric.hrv_ms)}`, sub: 'ms' })
  }

  return (
    <section
      aria-label="Recovery"
      className="rounded-lg border border-border bg-surface p-3"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
          Recovery
        </span>
        <span className="text-[11px] text-muted">{dayLabel(metric.metric_date)}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((t) => {
          const Icon = t.icon
          return (
            <div
              key={t.label}
              className="flex flex-col gap-1 rounded-md border border-border bg-background p-2.5"
            >
              <span className="flex items-center gap-1.5 text-[11px] text-muted">
                <Icon className="size-3.5 text-signal" aria-hidden />
                {t.label}
              </span>
              <span className="font-mono text-lg font-semibold tabular-nums leading-none text-foreground">
                {t.value}
                {t.sub ? <span className="ml-1 text-xs font-normal text-muted">{t.sub}</span> : null}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
