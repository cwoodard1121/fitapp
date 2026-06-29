import { format, parseISO } from 'date-fns'
import { Footprints, Moon, HeartPulse, Activity, Gauge } from 'lucide-react'

import type { RecoveryMetric } from '@/lib/types'
import { recoveryBand, type RecoveryScore } from '@/lib/recovery/score'

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

const TONE = {
  green: { box: 'border-gate-green/40 bg-gate-green/10', text: 'text-gate-green' },
  neutral: { box: 'border-border bg-background', text: 'text-foreground' },
  amber: { box: 'border-gate-yellow/40 bg-gate-yellow/10', text: 'text-gate-yellow' },
  red: { box: 'border-gate-red/40 bg-gate-red/10', text: 'text-gate-red' },
} as const

/**
 * RecoveryStrip — a compact wearable readout for the Today screen: a baseline-
 * relative recovery score (when there's enough history) plus the most recent
 * day's steps + sleep (and resting HR / HRV when present). Presentational; the
 * page passes the latest RecoveryMetric, the computed score, and gates on the
 * allowlist.
 */
export function RecoveryStrip({
  metric,
  score,
}: {
  metric: RecoveryMetric
  score?: RecoveryScore | null
}) {
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

  const ok = score && score.status === 'ok' ? score : null
  const band = ok ? recoveryBand(ok.score) : null
  const sub = ok ? (ok.drivers.length ? ok.drivers.slice(0, 2).join(' · ') : band!.fallback) : null

  return (
    <section aria-label="Recovery" className="rounded-lg border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
          Recovery
        </span>
        <span className="text-[11px] text-muted">{dayLabel(metric.metric_date)}</span>
      </div>

      {ok && band ? (
        <div className={`mb-3 flex items-center gap-3 rounded-md border p-3 ${TONE[band.tone].box}`}>
          <div className="flex shrink-0 flex-col items-center leading-none">
            <span className={`font-mono text-3xl font-bold tabular-nums ${TONE[band.tone].text}`}>
              {ok.score}
            </span>
            <span className="mt-0.5 text-[10px] text-muted">/ 100</span>
          </div>
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${TONE[band.tone].text}`}>
              Recovery score · {band.headline}
            </p>
            <p className="truncate text-xs text-muted">{sub}</p>
          </div>
        </div>
      ) : score && score.status === 'building' ? (
        <p className="mb-3 flex items-center gap-1.5 rounded-md border border-border bg-background p-2.5 text-xs text-muted">
          <Gauge className="size-3.5 shrink-0 text-signal" aria-hidden />
          Recovery score — building your baseline ({score.baselineDays} day
          {score.baselineDays === 1 ? '' : 's'} of history so far).
        </p>
      ) : null}

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
