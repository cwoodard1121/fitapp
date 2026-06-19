import { format } from 'date-fns'

import { createClient } from '@/lib/supabase/server'
import { requireUserId, getProfile } from '@/lib/data'
import type { Block, NutritionLog } from '@/lib/types'

import { NutritionClient } from '@/components/nutrition/nutrition-client'

export const dynamic = 'force-dynamic'

/** How many recent days we pull for the list + trend. */
const WINDOW_DAYS = 21

export default async function NutritionPage() {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)
  const profile = await getProfile()

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
        maintenance={profile?.maintenance_calories ?? null}
        unit={profile?.unit ?? 'lb'}
      />
    </div>
  )
}
