/**
 * Server entry for the deterministic analytics layer. Fetches the rows the pure
 * compute functions need — scoped to the authenticated user (RLS enforces this
 * too) — and hands them to computeAnalytics.
 *
 * No LLM and no allowlist here: the analytics are ALWAYS computable. They must
 * work in Week 1 with thin data (returning nulls / empty arrays), which is the
 * whole point — there is always something concrete to show.
 */
import type {
  Block,
  BodyMetric,
  ExerciseSlot,
  Goal,
  NutritionLog,
  SetLog,
} from '@/lib/types'
import { getActiveProgram, getProgramFull, requireUserId } from '@/lib/data'
import { createClient } from '@/lib/supabase/server'

import { computeAnalytics } from './compute'
import type { TrainingAnalytics } from './types'

export type { TrainingAnalytics } from './types'
export type {
  LiftAnalytic,
  GoalAnalytic,
  BodyAnalytic,
  MuscleVolumeAnalytic,
  NutritionAnalytic,
  MesoAnalytic,
} from './types'
export { computeAnalytics } from './compute'
export type { AnalyticsInput } from './compute'

/**
 * Gather every row the analytics need and compute the TrainingAnalytics bundle
 * for the current user. Always returns a fully-shaped result (empty arrays /
 * null fields when there is no data).
 */
export async function gatherAnalytics(): Promise<TrainingAnalytics> {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)

  const program = await getActiveProgram()
  let slots: ExerciseSlot[] = []
  if (program) {
    const full = await getProgramFull(program.id)
    slots = full?.slots ?? []
  }

  const [logsRes, goalsRes, bodyRes, nutritionRes, blockRes] = await Promise.all([
    supabase
      .from('set_logs')
      .select('*')
      .eq('user_id', userId)
      .order('week', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase.from('goals').select('*').eq('user_id', userId),
    supabase
      .from('body_metrics')
      .select('*')
      .eq('user_id', userId)
      .order('measured_on', { ascending: true }),
    supabase
      .from('nutrition_logs')
      .select('*')
      .eq('user_id', userId)
      .order('logged_on', { ascending: false })
      .limit(30),
    supabase
      .from('blocks')
      .select('*')
      .eq('user_id', userId)
      .eq('kind', 'diet')
      .eq('is_active', true)
      .order('start_date', { ascending: false })
      .limit(1),
  ])

  const logs = (logsRes.data as SetLog[]) ?? []
  const goals = (goalsRes.data as Goal[]) ?? []
  const bodyMetrics = (bodyRes.data as BodyMetric[]) ?? []
  const nutrition = (nutritionRes.data as NutritionLog[]) ?? []
  const dietBlock = (blockRes.data?.[0] as Block | undefined) ?? null

  return computeAnalytics({
    now: new Date(),
    program,
    slots,
    logs,
    goals,
    bodyMetrics,
    nutrition,
    dietBlock,
  })
}
