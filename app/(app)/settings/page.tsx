import { ensureProfile, getActiveProgram } from '@/lib/data'
import { DEFAULT_WEIGHTS } from '@/lib/engine/engine'

import { ProfileForm } from '@/components/settings/profile-form'
import { ReadinessWeightsForm } from '@/components/settings/readiness-weights-form'
import { ReseedProgram } from '@/components/settings/reseed-program'
import { ResetProgram } from '@/components/settings/reset-program'

export const metadata = {
  title: 'Settings · simplegym',
}

export default async function SettingsPage() {
  const [profile, activeProgram] = await Promise.all([
    ensureProfile(),
    getActiveProgram(),
  ])

  const weights = profile.readiness_weights ?? DEFAULT_WEIGHTS

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

        <ReseedProgram hasProgram={activeProgram != null} />

        <ResetProgram />
      </div>
    </div>
  )
}
