import { format } from 'date-fns'

import { createClient } from '@/lib/supabase/server'
import { ensureProfile, requireUserId } from '@/lib/data'
import type { BodyMetric } from '@/lib/types'
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

  const { data, error } = await supabase
    .from('body_metrics')
    .select('*')
    .eq('user_id', userId)
    .order('measured_on', { ascending: true })
  if (error) throw error

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <BodyClient
        entries={(data ?? []) as BodyMetric[]}
        unit={unit}
        today={format(new Date(), 'yyyy-MM-dd')}
      />
    </div>
  )
}
