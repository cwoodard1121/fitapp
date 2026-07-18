import { subDays } from 'date-fns'

import { createClient } from '@/lib/supabase/server'
import { requireUserId, getProfile } from '@/lib/data'
import { epley1RM } from '@/lib/engine/engine'
import { normalizedBodyweight } from '@/lib/body/metrics'
import { latestBodyFatInterpretation } from '@/lib/body/body-fat'
import { exerciseNameKey } from '@/lib/exercises/identity'
import { getAnalysisAccess } from '@/lib/ai/allowlist'
import { getLatestAnalysis } from '@/lib/ai/analysis'
import { gatherAnalytics } from '@/lib/analytics'
import type { Block, BodyMetric, Goal } from '@/lib/types'
import { GoalsBoard } from '@/components/goals/goals-board'
import { GoalAnalyticsPanel } from '@/components/goals/goal-analytics'
import type { GoalWithCurrent } from '@/components/goals/types'

export const metadata = { title: 'Goals · simplegym' }

/* ------------------------------------------------------------------ */
/* Derive the live "current" value for a goal where we can             */
/* ------------------------------------------------------------------ */

type SetLogRow = {
  actual_load: number | null
  best_reps: number | null
  actual_sets: number | null
}

async function deriveCurrents(
  goals: Goal[],
  userId: string,
): Promise<Map<string, number | null>> {
  const supabase = await createClient()
  const out = new Map<string, number | null>()

  const needsBody = goals.some(
    (g) => g.metric_type === 'bodyweight' || g.metric_type === 'bodyfat',
  )
  const needsVolume = goals.some((g) => g.metric_type === 'volume')
  const e1rmNames = Array.from(
    new Set(
      goals
        .filter((g) => g.metric_type === 'e1rm' && g.exercise_name)
        .map((g) => g.exercise_name as string),
    ),
  )

  let bodyCurrent: { bodyweight: number | null; bodyfat: number | null } | null = null
  if (needsBody) {
    const [{ data: bodyRows }, { data: blockRows }] = await Promise.all([
      supabase
        .from('body_metrics')
        .select('*')
        .eq('user_id', userId)
        .order('measured_on', { ascending: true }),
      supabase
        .from('blocks')
        .select('phase,start_date')
        .eq('user_id', userId)
        .eq('kind', 'diet')
        .eq('is_active', true)
        .order('start_date', { ascending: false })
        .limit(1),
    ])
    const bodyMetrics = (bodyRows ?? []) as BodyMetric[]
    const activeDietBlock =
      (blockRows?.[0] as Pick<Block, 'phase' | 'start_date'> | undefined) ?? null
    const latestMeasuredBodyfat =
      latestBodyFatInterpretation(bodyMetrics)?.bodyfatPct ?? null
    const normalizedWeight = normalizedBodyweight(bodyMetrics, activeDietBlock)
    bodyCurrent = {
      bodyweight: normalizedWeight.value,
      bodyfat: latestMeasuredBodyfat,
    }
  }

  // Best recent e1RM per tracked exercise, grouped case-insensitively.
  const bestE1rm = new Map<string, number | null>()
  if (e1rmNames.length > 0) {
    const wanted = new Set(e1rmNames.map(exerciseNameKey))
    const { data } = await supabase
      .from('set_logs')
      .select('actual_load, best_reps, slot:exercise_slots!inner(exercise_name)')
      .eq('user_id', userId)
      .not('actual_load', 'is', null)
      .not('best_reps', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1000)
    for (const row of (data ?? []) as unknown as Array<{
      actual_load: number | null
      best_reps: number | null
      slot: { exercise_name: string } | { exercise_name: string }[]
    }>) {
      const slot = Array.isArray(row.slot) ? row.slot[0] : row.slot
      if (!slot) continue
      const key = exerciseNameKey(slot.exercise_name)
      if (!wanted.has(key) || row.actual_load == null || row.best_reps == null) continue
      const e = epley1RM(row.actual_load, row.best_reps)
      const previous = bestE1rm.get(key)
      if (previous == null || e > previous) bestE1rm.set(key, Math.round(e * 10) / 10)
    }
  }

  // Recent weekly tonnage (last 7 days), shared across all volume goals.
  let recentTonnage: number | null = null
  if (needsVolume) {
    const since = subDays(new Date(), 7).toISOString()
    const { data } = await supabase
      .from('set_logs')
      .select('actual_load, best_reps, actual_sets')
      .eq('user_id', userId)
      .gte('created_at', since)
    const rows = (data ?? []) as SetLogRow[]
    let sum = 0
    let any = false
    for (const r of rows) {
      if (r.actual_load != null && r.best_reps != null && r.actual_sets != null) {
        sum += r.actual_load * r.best_reps * r.actual_sets
        any = true
      }
    }
    recentTonnage = any ? sum : null
  }

  for (const g of goals) {
    switch (g.metric_type) {
      case 'bodyweight':
        out.set(g.id, bodyCurrent?.bodyweight ?? null)
        break
      case 'bodyfat':
        out.set(g.id, bodyCurrent?.bodyfat ?? null)
        break
      case 'e1rm':
        out.set(
          g.id,
          g.exercise_name ? bestE1rm.get(exerciseNameKey(g.exercise_name)) ?? null : null,
        )
        break
      case 'volume':
        out.set(g.id, recentTonnage)
        break
      default:
        out.set(g.id, null)
    }
  }

  return out
}

export default async function GoalsPage() {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)

  const [{ data: goalRows }, profile] = await Promise.all([
    supabase
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    getProfile(),
  ])

  const goals = (goalRows ?? []) as Goal[]
  const currents = await deriveCurrents(goals, userId)

  const enriched: GoalWithCurrent[] = goals.map((g) => ({
    ...g,
    current: currents.get(g.id) ?? null,
  }))

  const unit = profile?.unit ?? 'lb'

  // Deterministic goal pacing — ALWAYS computed (no LLM / allowlist needed).
  const analytics = await gatherAnalytics()

  // AI goal advice, gated to allowed accounts. Skips the query when not allowed;
  // the panel renders nothing AI-related when advice / summary are absent.
  const { allowed } = await getAnalysisAccess()
  const analysis = allowed ? await getLatestAnalysis() : null

  // Pace only the active goals, in the board's order.
  const activeIds = new Set(
    enriched.filter((g) => g.status === 'active').map((g) => g.id),
  )
  const goalPacing = analytics.goals.filter((g) => activeIds.has(g.id))

  const goalAdvice = analysis?.payload.goals.items ?? []
  const aiSummary = analysis?.payload.goals.summary ?? null

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-6 sm:pb-10">
      <GoalAnalyticsPanel
        goals={goalPacing}
        advice={goalAdvice}
        aiSummary={aiSummary}
      />
      <GoalsBoard goals={enriched} unit={unit} />
    </div>
  )
}
