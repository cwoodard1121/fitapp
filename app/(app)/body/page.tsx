import { format } from 'date-fns'

import { createClient } from '@/lib/supabase/server'
import { ensureProfile, requireUserId } from '@/lib/data'
import type { Block, BodyMetric } from '@/lib/types'
import { BodyClient } from '@/components/body/body-client'

export const metadata = {
  title: 'Body metrics',
}

export const dynamic = 'force-dynamic'

export default async function BodyPage() {
  const profile = await ensureProfile()
  const today = format(new Date(), 'yyyy-MM-dd')
  const supabase = await createClient()
  const userId = await requireUserId(supabase)

  const [{ data, error }, { data: blockRows, error: blockError }] =
    await Promise.all([
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
  if (error) throw error
  if (blockError) throw blockError

  const activeDietBlock =
    (blockRows?.[0] as Pick<Block, 'phase' | 'start_date'> | undefined) ?? null

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <BodyClient
        entries={(data ?? []) as BodyMetric[]}
        unit={profile.unit}
        heightCm={profile.height_cm}
        activeDietBlock={activeDietBlock}
        today={today}
      />
    </div>
  )
}
