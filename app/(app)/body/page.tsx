import { format } from 'date-fns'

import { createClient } from '@/lib/supabase/server'
import { ensureProfile, getActiveProgram, getProgramFull, requireUserId } from '@/lib/data'
import { epley1RM } from '@/lib/engine/engine'
import type { BaselineLift, Block, BodyMetric, ExerciseSlot, SetLog } from '@/lib/types'
import {
  strengthLiftKind,
  type StrengthEstimatePoint,
  type StrengthLiftKind,
} from '@/lib/body/metrics'
import { BodyClient } from '@/components/body/body-client'

export const metadata = {
  title: 'Body metrics',
}

export const dynamic = 'force-dynamic'

type LiftNameSuggestions = Partial<Record<StrengthLiftKind, string>>

function liftSuggestionScore(kind: StrengthLiftKind, name: string) {
  const lower = name.toLowerCase()
  let score = 0

  if (kind === 'bench') {
    if (lower.includes('touch')) score += 40
    if (lower.includes('competition')) score += 30
    if (lower.includes('barbell')) score += 20
    if (lower.includes('incline')) score -= 20
    if (lower.includes('close-grip') || lower.includes('close grip')) score -= 15
  }

  if (kind === 'squat') {
    if (lower.includes('back squat')) score += 35
    if (lower.includes('barbell')) score += 20
    if (lower.includes('front squat')) score += 10
    if (lower.includes('hack')) score -= 25
  }

  if (kind === 'deadlift') {
    if (lower.includes('conventional')) score += 25
    if (lower === 'deadlift' || lower.includes(' deadlift')) score += 20
    if (lower.includes('sumo')) score += 10
  }

  if (kind === 'press') {
    if (lower.includes('overhead')) score += 30
    if (lower.includes('military')) score += 25
    if (lower.includes('barbell')) score += 20
  }

  return score
}

function suggestedBaselineLiftNames(
  slots: Pick<ExerciseSlot, 'exercise_name'>[],
): LiftNameSuggestions {
  const best = new Map<StrengthLiftKind, { name: string; score: number }>()
  for (const slot of slots) {
    const kind = strengthLiftKind(slot.exercise_name)
    if (!kind) continue
    const score = liftSuggestionScore(kind, slot.exercise_name)
    const previous = best.get(kind)
    if (!previous || score > previous.score) {
      best.set(kind, { name: slot.exercise_name, score })
    }
  }

  return Object.fromEntries([...best].map(([kind, value]) => [kind, value.name]))
}

export default async function BodyPage() {
  const profile = await ensureProfile()
  const unit = profile.unit
  const today = format(new Date(), 'yyyy-MM-dd')

  const supabase = await createClient()
  const userId = await requireUserId(supabase)
  const activeProgram = await getActiveProgram()
  const activeProgramFull = activeProgram ? await getProgramFull(activeProgram.id) : null
  const suggestedLiftNames = suggestedBaselineLiftNames(activeProgramFull?.slots ?? [])

  const [
    { data, error },
    { data: blockRows, error: blockError },
    { data: logRows, error: logError },
    { data: slotRows, error: slotError },
    { data: baselineRows, error: baselineError },
  ] = await Promise.all([
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
    supabase
      .from('set_logs')
      .select('slot_id,created_at,actual_load,best_reps')
      .eq('user_id', userId)
      .order('created_at', { ascending: true }),
    supabase.from('exercise_slots').select('id,exercise_name').eq('user_id', userId),
    supabase
      .from('baseline_lifts')
      .select('*')
      .eq('user_id', userId)
      .order('lift_kind', { ascending: true }),
  ])
  if (error) throw error
  if (blockError) throw blockError
  if (logError) throw logError
  if (slotError) throw slotError
  if (baselineError) throw baselineError

  const activeDietBlock =
    (blockRows?.[0] as Pick<Block, 'phase' | 'start_date'> | undefined) ?? null
  const baselineLifts = (baselineRows ?? []) as BaselineLift[]
  const slotNameById = new Map(
    ((slotRows ?? []) as Pick<ExerciseSlot, 'id' | 'exercise_name'>[]).map((slot) => [
      slot.id,
      slot.exercise_name,
    ]),
  )
  const loggedStrengthPoints = ((logRows ?? []) as Pick<
    SetLog,
    'slot_id' | 'created_at' | 'actual_load' | 'best_reps'
  >[])
    .flatMap((log): StrengthEstimatePoint[] => {
      const exerciseName = slotNameById.get(log.slot_id)
      if (!exerciseName || log.actual_load == null || log.best_reps == null) return []
      return [
        {
          date: log.created_at.slice(0, 10),
          exerciseName,
          e1rm: Math.round(epley1RM(log.actual_load, log.best_reps) * 10) / 10,
          source: 'logged',
        },
      ]
    })
  const baselineStrengthPoints: StrengthEstimatePoint[] = baselineLifts.map((lift) => ({
    date: lift.lifted_on ?? today,
    exerciseName: lift.exercise_name,
    e1rm: Number(lift.e1rm),
    source: 'baseline',
  }))
  const strengthPoints = [...loggedStrengthPoints, ...baselineStrengthPoints]

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <BodyClient
        entries={(data ?? []) as BodyMetric[]}
        unit={unit}
        activeDietBlock={activeDietBlock}
        strengthPoints={strengthPoints}
        baselineLifts={baselineLifts}
        suggestedBaselineLiftNames={suggestedLiftNames}
        today={today}
      />
    </div>
  )
}
