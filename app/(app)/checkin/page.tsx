import { format, parseISO } from 'date-fns'

import {
  getProfile,
  getPrograms,
  getPendingSorenessCheckIns,
  getDailyHabitSummaries,
  requireUserId,
} from '@/lib/data'
import { appCalendarDate } from '@/lib/data/soreness'
import type { BodyMetric, RecoveryMetric } from '@/lib/types'
import { navyBodyFatSummaryInISOWeek } from '@/lib/body/body-fat'
import { getAnalysisAccess } from '@/lib/ai/allowlist'
import { getLatestAnalysis } from '@/lib/ai/analysis'
import { createClient } from '@/lib/supabase/server'
import { getRecoveryRange } from '@/lib/wearables/store'
import { computeRecoveryScore, type RecoveryScore } from '@/lib/recovery/score'
import { RecoveryStrip } from '@/components/today/recovery-strip'
import { AnalysisFocus } from '@/components/analysis/analysis-focus'
import { WeeklyNavyPrompt } from '@/components/today/weekly-navy-prompt'
import { SorenessCheckIn } from '@/components/today/soreness-check-in'
import { DailyHabitsCard } from '@/components/today/daily-habits-card'

export const dynamic = 'force-dynamic'

/**
 * Everything that isn't "log today's lifts": habit tallies, soreness
 * check-ins, the weekly body-fat tape reminder, wearable recovery, and the
 * AI's current focus. Pulled off Today so that page stays pure workout —
 * this one is the daily wellness check-in.
 */
export default async function CheckinPage() {
  const [profile, programs] = await Promise.all([
    getProfile(),
    getPrograms(),
  ])
  const program = programs.find((p) => p.is_active) ?? null

  const today = appCalendarDate(new Date())
  const supabase = await createClient()
  const userId = await requireUserId(supabase)

  const [bodyResult, sorenessPrompts, habitSummaries] = await Promise.all([
    supabase
      .from('body_metrics')
      .select('*')
      .eq('user_id', userId)
      .order('measured_on', { ascending: false })
      .limit(30),
    getPendingSorenessCheckIns(),
    getDailyHabitSummaries(supabase, userId, today),
  ])
  const { data: bodyRows, error: bodyError } = bodyResult
  if (bodyError) throw bodyError
  const bodyEntries = (bodyRows ?? []) as BodyMetric[]
  const trackNavy = profile?.track_navy_bodyfat !== false
  const weeklyNavyDue =
    trackNavy &&
    (navyBodyFatSummaryInISOWeek(bodyEntries, today)?.acceptedSampleCount ?? 0) === 0

  // Cheap AI coaching, gated to allowed accounts.
  const { allowed } = await getAnalysisAccess()
  const payload = allowed ? (await getLatestAnalysis())?.payload ?? null : null
  const focus = payload?.focus ?? []

  // Most recent wearable readout + a baseline-relative recovery score. Its
  // baseline starts with the current training block, so each phase
  // establishes its own normal. No active program -> no block context, so the
  // score falls back to a programless baseline rather than failing.
  let latestRecovery: RecoveryMetric | null = null
  let recoveryScore: RecoveryScore | null = null
  if (allowed) {
    const { data: trainingBlockRows, error: trainingBlockError } = await supabase
      .from('blocks')
      .select('program_id,phase,start_date')
      .eq('user_id', userId)
      .eq('kind', 'training')
      .eq('is_active', true)
      .order('start_date', { ascending: false })
    if (trainingBlockError) throw trainingBlockError
    const trainingBlock = program
      ? (trainingBlockRows?.find((block) => block.program_id === program.id) ??
        trainingBlockRows?.find((block) => block.program_id == null) ??
        trainingBlockRows?.[0] ??
        null)
      : (trainingBlockRows?.[0] ?? null)
    const recoveryBaselineStart = trainingBlock?.start_date ?? program?.start_date ?? null
    const recent = await getRecoveryRange(supabase, userId, 35)
    for (let i = recent.length - 1; i >= 0; i--) {
      if (recent[i].steps != null || recent[i].sleep_minutes_asleep != null) {
        latestRecovery = recent[i]
        break
      }
    }
    if (latestRecovery) {
      recoveryScore = computeRecoveryScore(recent, latestRecovery.metric_date, {
        baselineStart: recoveryBaselineStart,
      })
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-4 sm:pt-6">
      <header className="mb-1">
        <h1 className="text-[1.75rem] font-extrabold lowercase leading-[1.1] tracking-[-0.025em] font-wide">
          {format(parseISO(today), 'EEEE, MMM d')}
        </h1>
        <p className="mt-1 text-sm font-medium text-muted">
          Habits, soreness and recovery for today.
        </p>
      </header>

      {weeklyNavyDue ? (
        <WeeklyNavyPrompt heightCm={profile?.height_cm ?? null} today={today} />
      ) : null}

      <DailyHabitsCard summaries={habitSummaries} />

      <SorenessCheckIn prompts={sorenessPrompts} />

      {latestRecovery ? (
        <div className="mt-4">
          <RecoveryStrip metric={latestRecovery} score={recoveryScore} />
        </div>
      ) : null}

      {focus.length > 0 ? (
        <div className="mt-4">
          <AnalysisFocus focus={focus} />
        </div>
      ) : null}
    </div>
  )
}
