import { format } from 'date-fns'

import { createClient } from '@/lib/supabase/server'
import { ensureProfile, requireUserId } from '@/lib/data'
import { epley1RM } from '@/lib/engine/engine'
import type { Block, BodyMetric, ExerciseSlot, SetLog } from '@/lib/types'
import type { StrengthEstimatePoint } from '@/lib/body/metrics'
import { BodyClient } from '@/components/body/body-client'

export const metadata = {
  title: 'Body metrics',
}

export const dynamic = 'force-dynamic'

export default async function BodyPage() {
  const profile = await ensureProfile()
  const unit = profile.unit

  const supabase = await createClient()
  const userId = await requireUserId(supabase)

  const [
    { data, error },
    { data: blockRows, error: blockError },
    { data: logRows, error: logError },
    { data: slotRows, error: slotError },
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
  ])
  if (error) throw error
  if (blockError) throw blockError
  if (logError) throw logError
  if (slotError) throw slotError

  const activeDietBlock =
    (blockRows?.[0] as Pick<Block, 'phase' | 'start_date'> | undefined) ?? null
  const slotNameById = new Map(
    ((slotRows ?? []) as Pick<ExerciseSlot, 'id' | 'exercise_name'>[]).map((slot) => [
      slot.id,
      slot.exercise_name,
    ]),
  )
  const strengthPoints = ((logRows ?? []) as Pick<
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
        },
      ]
    })

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <BodyClient
        entries={(data ?? []) as BodyMetric[]}
        unit={unit}
        activeDietBlock={activeDietBlock}
        strengthPoints={strengthPoints}
        today={format(new Date(), 'yyyy-MM-dd')}
      />
    </div>
  )
}
