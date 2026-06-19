import { subDays } from 'date-fns'

import { createClient } from '@/lib/supabase/server'
import { requireUserId, getProfile } from '@/lib/data'
import { epley1RM } from '@/lib/engine/engine'
import type { Goal } from '@/lib/types'
import { GoalsBoard } from '@/components/goals/goals-board'
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

  // Latest body metric (one row covers both bodyweight + bodyfat goals).
  type LatestBody = { bodyweight: number | null; bodyfat_pct: number | null }
  let latestBody: LatestBody | null = null
  if (needsBody) {
    const { data } = await supabase
      .from('body_metrics')
      .select('bodyweight, bodyfat_pct, measured_on')
      .eq('user_id', userId)
      .order('measured_on', { ascending: false })
      .limit(1)
      .maybeSingle()
    latestBody = (data as LatestBody | null) ?? null
  }

  // Best recent e1RM per tracked exercise (best Epley over the last ~60 logs).
  const bestE1rm = new Map<string, number | null>()
  await Promise.all(
    e1rmNames.map(async (name) => {
      const { data } = await supabase
        .from('set_logs')
        .select('actual_load, best_reps, slot:exercise_slots!inner(exercise_name)')
        .eq('user_id', userId)
        .eq('slot.exercise_name', name)
        .not('actual_load', 'is', null)
        .not('best_reps', 'is', null)
        .order('created_at', { ascending: false })
        .limit(60)
      let best: number | null = null
      for (const row of (data ?? []) as Array<{
        actual_load: number | null
        best_reps: number | null
      }>) {
        if (row.actual_load != null && row.best_reps != null) {
          const e = epley1RM(row.actual_load, row.best_reps)
          if (best == null || e > best) best = e
        }
      }
      bestE1rm.set(name, best == null ? null : Math.round(best * 10) / 10)
    }),
  )

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
        out.set(g.id, latestBody?.bodyweight ?? null)
        break
      case 'bodyfat':
        out.set(g.id, latestBody?.bodyfat_pct ?? null)
        break
      case 'e1rm':
        out.set(g.id, g.exercise_name ? bestE1rm.get(g.exercise_name) ?? null : null)
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

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-6 sm:pb-10">
      <GoalsBoard goals={enriched} unit={unit} />
    </div>
  )
}
