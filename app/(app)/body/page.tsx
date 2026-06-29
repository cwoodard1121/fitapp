import { format } from 'date-fns'

import { createClient } from '@/lib/supabase/server'
import { ensureProfile, requireUserId } from '@/lib/data'
import type { BodyMetric, NutritionLog } from '@/lib/types'
import { computeCalibration, type Calibration } from '@/lib/nutrition/calibration'
import { DEFAULT_STEP_BASELINE, TRACKING_START } from '@/lib/nutrition/deficit'
import { BodyClient } from '@/components/body/body-client'

export const metadata = {
  title: 'Body metrics',
}

export const dynamic = 'force-dynamic'

const KG_PER_LB = 1 / 2.2046226218

export default async function BodyPage() {
  const profile = await ensureProfile()
  const unit = profile.unit

  const supabase = await createClient()
  const userId = await requireUserId(supabase)

  const { data, error } = await supabase
    .from('body_metrics')
    .select('*')
    .eq('user_id', userId)
    .order('measured_on', { ascending: true })
  if (error) throw error
  const entries = (data ?? []) as BodyMetric[]

  const today = format(new Date(), 'yyyy-MM-dd')

  // The calibration compares predicted vs actual loss since the TRACKING START
  // (June 20) — a fixed recent window. NOT the diet block: a block that started
  // after June 20 would shrink this to a noisy day-or-two and flip the sign. The
  // trend chart still shows ALL data; only this calc is windowed.
  const windowStart = TRACKING_START
  const windowStartStr = format(windowStart, 'yyyy-MM-dd')

  const [{ data: nutRows }, { data: recRows }] = await Promise.all([
    supabase
      .from('nutrition_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('logged_on', windowStartStr),
    supabase
      .from('recovery_metrics')
      .select('metric_date, steps')
      .eq('user_id', userId)
      .gte('metric_date', windowStartStr),
  ])
  const nutLogs = (nutRows ?? []) as NutritionLog[]
  const stepsByDate: Record<string, number> = {}
  for (const r of (recRows ?? []) as { metric_date: string; steps: number | null }[]) {
    if (r.steps != null) stepsByDate[r.metric_date] = r.steps
  }

  const latestWeight = entries.length ? entries[entries.length - 1].bodyweight : null
  const weightKg =
    latestWeight == null ? 0 : unit === 'lb' ? latestWeight * KG_PER_LB : latestWeight

  const stepBaseline = profile.maintenance_step_baseline ?? DEFAULT_STEP_BASELINE
  const calibration: Calibration = computeCalibration({
    bodyEntries: entries,
    logs: nutLogs,
    stepsByDate,
    maintenance: profile.maintenance_calories,
    stepBaseline,
    weightKg,
    minCalories: profile.nutrition_min_calories,
    unit,
    windowStart,
    today,
  })

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <BodyClient
        entries={entries}
        unit={unit}
        today={today}
        calibration={calibration}
        maintenance={profile.maintenance_calories}
        stepBaseline={stepBaseline}
      />
    </div>
  )
}
