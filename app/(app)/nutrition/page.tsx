import { format, parseISO } from 'date-fns'

import { createClient } from '@/lib/supabase/server'
import { requireUserId, getProfile } from '@/lib/data'
import type { Block, BodyMetric, NutritionLog } from '@/lib/types'
import { computeCalibration, type Calibration } from '@/lib/nutrition/calibration'
import { DEFAULT_STEP_BASELINE } from '@/lib/nutrition/deficit'

import { NutritionClient } from '@/components/nutrition/nutrition-client'

export const dynamic = 'force-dynamic'

/** How many days we pull. The deficit tracker uses all of these (Week/Month
 *  as rolling 30d/Block/All windows); the list + trend slices the most recent 21 client-side. */
const WINDOW_DAYS = 365

const KG_PER_LB = 1 / 2.2046226218

export default async function NutritionPage() {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)
  const profile = await getProfile()
  const unit = profile?.unit ?? 'lb'
  const maintenance = profile?.maintenance_calories ?? null
  const stepBaseline = profile?.maintenance_step_baseline ?? DEFAULT_STEP_BASELINE
  const minCalories = profile ? profile.nutrition_min_calories : 1200

  const today = format(new Date(), 'yyyy-MM-dd')

  // Active diet block (kind=diet, is_active) supplies the targets we measure
  // today's intake against. There should be at most one.
  const { data: blockRows } = await supabase
    .from('blocks')
    .select('*')
    .eq('user_id', userId)
    .eq('kind', 'diet')
    .eq('is_active', true)
    .order('start_date', { ascending: false })
    .limit(1)

  const activeBlock = (blockRows?.[0] ?? null) as Block | null

  // Recent days, newest first.
  const { data: logRows } = await supabase
    .from('nutrition_logs')
    .select('*')
    .eq('user_id', userId)
    .order('logged_on', { ascending: false })
    .limit(WINDOW_DAYS)

  const logs = (logRows ?? []) as NutritionLog[]

  const [{ data: recoveryRows }, { data: bodyRows }] = await Promise.all([
    supabase
      .from('recovery_metrics')
      .select('metric_date, steps')
      .eq('user_id', userId)
      .order('metric_date', { ascending: false })
      .limit(WINDOW_DAYS),
    supabase
      .from('body_metrics')
      .select('*')
      .eq('user_id', userId)
      .order('measured_on', { ascending: true }),
  ])

  const stepsByDate: Record<string, number> = {}
  for (const row of (recoveryRows ?? []) as { metric_date: string; steps: number | null }[]) {
    if (row.steps != null) stepsByDate[row.metric_date] = row.steps
  }

  const bodyMetrics = (bodyRows ?? []) as BodyMetric[]
  const latestWeight =
    [...bodyMetrics].reverse().find((row) => row.bodyweight != null)?.bodyweight ?? null
  const weightKg =
    latestWeight == null ? null : unit === 'lb' ? latestWeight * KG_PER_LB : latestWeight

  let calibration: Calibration | null = null
  if (activeBlock?.start_date) {
    calibration = computeCalibration({
      bodyEntries: bodyMetrics,
      logs,
      stepsByDate,
      maintenance,
      stepBaseline,
      weightKg: weightKg ?? 0,
      minCalories,
      unit,
      windowStart: parseISO(activeBlock.start_date),
      today,
    })
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-5 sm:pb-10">
      <header className="mb-5 flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
          nutrition
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Daily intake
        </h1>
        <p className="text-sm text-muted">
          Log what you ate. Track it against your active diet block.
        </p>
      </header>

      <NutritionClient
        today={today}
        activeBlock={activeBlock}
        logs={logs}
        maintenance={maintenance}
        unit={unit}
        stepsByDate={stepsByDate}
        weightKg={weightKg}
        stepBaseline={stepBaseline}
        minCalories={minCalories}
        calibration={calibration}
      />
    </div>
  )
}
