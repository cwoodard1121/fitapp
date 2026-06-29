import { ensureProfile, getActiveProgram, requireUserId } from '@/lib/data'
import { DEFAULT_WEIGHTS } from '@/lib/engine/engine'
import { getAnalysisAccess } from '@/lib/ai/allowlist'
import { createClient } from '@/lib/supabase/server'
import { getConnection, getRecentRecovery } from '@/lib/wearables/store'

import { ProfileForm } from '@/components/settings/profile-form'
import { ReadinessWeightsForm } from '@/components/settings/readiness-weights-form'
import { ReseedProgram } from '@/components/settings/reseed-program'
import { ResetProgram } from '@/components/settings/reset-program'
import {
  WearableConnect,
  type WearableConnectData,
} from '@/components/settings/wearable-connect'

export const metadata = {
  title: 'Settings · simplegym',
}

export default async function SettingsPage() {
  const [profile, activeProgram] = await Promise.all([
    ensureProfile(),
    getActiveProgram(),
  ])

  const weights = profile.readiness_weights ?? DEFAULT_WEIGHTS

  // Wearable sync is the owner's personal integration — gate it to allowlisted
  // accounts like the other AI features. Fetch the current connection + recent
  // imported days so the card can render status and data.
  const { allowed } = await getAnalysisAccess()
  let wearable: WearableConnectData | null = null
  if (allowed) {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)
    const connection = await getConnection(supabase, userId)
    const recent = connection ? await getRecentRecovery(supabase, userId, 7) : []
    wearable = {
      connected: connection != null,
      status: connection?.status ?? null,
      // recovery rows share synced_at = the sync time; prefer it (the connection's
      // updated_at only moves on a token refresh/status change, so it can lag a
      // sync that didn't need to refresh).
      lastSynced: recent[0]?.synced_at ?? connection?.updated_at ?? null,
      recent,
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-6 sm:pb-12">
      <header className="mb-6 flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
          settings
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Your setup</h1>
        <p className="text-sm text-muted">
          Tune how the app addresses you, how the mesocycle runs, and how the
          engine weighs your readiness.
        </p>
      </header>

      <div className="flex flex-col gap-6">
        <ProfileForm profile={profile} />

        <ReadinessWeightsForm
          weights={weights}
          isCustom={profile.readiness_weights != null}
        />

        {wearable ? <WearableConnect data={wearable} /> : null}

        <ReseedProgram hasProgram={activeProgram != null} />

        <ResetProgram />
      </div>
    </div>
  )
}
