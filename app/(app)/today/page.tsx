import type { ReactNode } from 'react'
import { format } from 'date-fns'
import { CalendarDays } from 'lucide-react'

import {
  getProfile,
  getPrograms,
  getProgramFull,
  getSessionForDay,
  getSetLogsForSession,
  ensureWeekSessions,
  buildTodayView,
  weekForDate,
  mesocycleNumber,
  requireUserId,
} from '@/lib/data'
import type {
  BodyMetric,
  RecoveryMetric,
  Session,
  SessionStatus,
} from '@/lib/types'
import { navyMeasurementInISOWeek } from '@/lib/body/body-fat'
import { getAnalysisAccess } from '@/lib/ai/allowlist'
import { getLatestAnalysis } from '@/lib/ai/analysis'
import { createClient } from '@/lib/supabase/server'
import { getRecoveryRange } from '@/lib/wearables/store'
import { computeRecoveryScore, suggestedReadiness, type RecoveryScore } from '@/lib/recovery/score'
import type { LiftAdvice } from '@/lib/types'
import { exerciseNameKey } from '@/lib/exercises/identity'
import { Badge } from '@/components/ui/badge'
import { RecoveryStrip } from '@/components/today/recovery-strip'
import { AnalysisFocus } from '@/components/analysis/analysis-focus'
import { ExerciseAdvice } from '@/components/today/exercise-advice'
import { ActiveProgramSelect } from '@/components/program/active-program-select'
import { DaySelector } from '@/components/today/day-selector'
import { SessionReadiness } from '@/components/today/session-readiness'
import { SlotRow } from '@/components/today/slot-row'
import { SessionBar } from '@/components/today/session-bar'
import { EmptyState } from '@/components/today/empty-state'
import { WeeklyNavyPrompt } from '@/components/today/weekly-navy-prompt'

export const dynamic = 'force-dynamic'

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>
}) {
  const { day: dayParam } = await searchParams

  const [profile, programs] = await Promise.all([
    getProfile(),
    getPrograms(),
  ])
  const program = programs.find((p) => p.is_active) ?? null

  const unit = profile?.unit ?? 'lb'
  const today = format(new Date(), 'yyyy-MM-dd')
  const supabase = await createClient()
  const userId = await requireUserId(supabase)
  const { data: bodyRows, error: bodyError } = await supabase
    .from('body_metrics')
    .select('*')
    .eq('user_id', userId)
    .order('measured_on', { ascending: false })
    .limit(30)
  if (bodyError) throw bodyError
  const bodyEntries = (bodyRows ?? []) as BodyMetric[]
  const weeklyNavyDue =
    navyMeasurementInISOWeek(bodyEntries, today) == null

  // No program -> friendly empty state with the next action.
  if (!program) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-4">
        <Header unit={unit} />
        {weeklyNavyDue ? (
          <WeeklyNavyPrompt heightCm={profile?.height_cm ?? null} today={today} />
        ) : null}
        <EmptyState />
      </div>
    )
  }

  const full = await getProgramFull(program.id)
  if (!full || full.days.length === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-4">
        <Header unit={unit} />
        {weeklyNavyDue ? (
          <WeeklyNavyPrompt heightCm={profile?.height_cm ?? null} today={today} />
        ) : null}
        <EmptyState />
      </div>
    )
  }

  // Each program owns its mesocycle anchor; a null start_date means Week 1.
  const startDate = program.start_date
  const week = weekForDate(startDate, program.length_weeks)
  const meso = mesocycleNumber(startDate, program.length_weeks)
  const isDeload = week === program.deload_week

  // Sessions for the whole week so the day selector can show progress and we
  // can default to the next unlogged day.
  const weekSessions = await ensureWeekSessions(program.id, week)
  const sessionByDay = new Map<string, Session>(
    weekSessions.map((s) => [s.day_id, s]),
  )
  const statusByDay: Record<string, SessionStatus> = {}
  for (const s of weekSessions) statusByDay[s.day_id] = s.status

  // Choose the day: explicit ?day= wins, else the first not-yet-done day,
  // else the first day.
  const validParam =
    dayParam && full.days.some((d) => d.id === dayParam) ? dayParam : null
  const nextUnlogged = full.days.find(
    (d) => (statusByDay[d.id] ?? 'planned') !== 'done',
  )
  const selectedDay =
    full.days.find((d) => d.id === validParam) ?? nextUnlogged ?? full.days[0]

  const session =
    sessionByDay.get(selectedDay.id) ??
    (await getSessionForDay(program.id, selectedDay.id, week))

  const daySlots = full.slots
    .filter((s) => s.day_id === selectedDay.id)
    .sort((a, b) => a.order_index - b.order_index)

  const logs = await getSetLogsForSession(session.id)
  const slotViews = await buildTodayView(
    session,
    daySlots,
    logs,
    program.deload_week,
    profile?.readiness_weights ?? undefined,
  )

  const allSlotIds = daySlots.map((s) => s.id)
  // Session-level systemic recovery is fanned across slots — read it from any.
  const sessionRecovery =
    slotViews.find((v) => v.log?.recovery != null)?.log?.recovery ?? null
  const loggedCount = slotViews.filter((v) => {
    const l = v.log
    return (
      l != null &&
      (l.actual_load != null ||
        l.best_reps != null ||
        l.actual_sets != null ||
        l.actual_rir != null)
    )
  }).length

  // Cheap AI coaching, gated to allowed accounts. Skips the analysis query
  // entirely when the account is not allowed; renders nothing when empty.
  const { allowed } = await getAnalysisAccess()
  const payload = allowed ? (await getLatestAnalysis())?.payload ?? null : null
  const focus = payload?.focus ?? []

  // Most recent wearable readout + a baseline-relative recovery score, gated like
  // the AI. Pull a month of history so the score has a baseline to compare against.
  let latestRecovery: RecoveryMetric | null = null
  let recoveryScore: RecoveryScore | null = null
  if (allowed) {
    const recent = await getRecoveryRange(supabase, userId, 35)
    for (let i = recent.length - 1; i >= 0; i--) {
      if (recent[i].steps != null || recent[i].sleep_minutes_asleep != null) {
        latestRecovery = recent[i]
        break
      }
    }
    if (latestRecovery) {
      recoveryScore = computeRecoveryScore(recent, latestRecovery.metric_date)
    }
  }

  // Match the AI's per-lift advice to the exercises on the selected day so the
  // log can show inline "coach notes" exactly where they're relevant.
  const adviceByExercise = new Map<string, LiftAdvice>()
  for (const a of payload?.training.lifts ?? []) {
    adviceByExercise.set(exerciseNameKey(a.exercise), a)
  }
  const dayAdvice: LiftAdvice[] = []
  const seen = new Set<string>()
  for (const s of daySlots) {
    const key = exerciseNameKey(s.exercise_name)
    if (seen.has(key)) continue
    seen.add(key)
    const a = adviceByExercise.get(key)
    if (a) dayAdvice.push(a)
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-4 pt-4">
      <Header unit={unit}>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-mono">
            Week {week}/{program.length_weeks}
          </Badge>
          {meso > 0 ? (
            <Badge variant="muted" className="font-mono">
              Meso {meso + 1}
            </Badge>
          ) : null}
          {isDeload ? <Badge variant="warning">Deload</Badge> : null}
        </div>
      </Header>

      {weeklyNavyDue ? (
        <WeeklyNavyPrompt heightCm={profile?.height_cm ?? null} today={today} />
      ) : null}

      <ActiveProgramSelect programs={programs} activeId={program.id} />

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

      <div className="mt-4">
        <DaySelector
          days={full.days}
          selectedDayId={selectedDay.id}
          statusByDay={statusByDay}
        />
      </div>

      {daySlots.length > 0 ? (
        <div className="mt-4">
          <SessionReadiness
            sessionId={session.id}
            week={week}
            allSlotIds={allSlotIds}
            recovery={sessionRecovery}
            suggested={
              recoveryScore && recoveryScore.status === 'ok'
                ? suggestedReadiness(recoveryScore.score)
                : null
            }
          />
        </div>
      ) : null}

      {daySlots.length > 0 && dayAdvice.length > 0 ? (
        <div className="mt-4">
          <ExerciseAdvice items={dayAdvice} />
        </div>
      ) : null}

      {daySlots.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-border bg-surface p-6 text-center">
          <p className="text-sm font-medium">No exercises on this day yet.</p>
          <p className="mt-1 text-sm text-muted">
            Add slots to {selectedDay.label} from the program editor.
          </p>
        </div>
      ) : (
        <ol className="mt-4 space-y-3">
          {slotViews.map((view) => (
            <li key={view.slot.id}>
              <SlotRow
                view={view}
                sessionId={session.id}
                week={week}
                unit={unit}
                allSlotIds={allSlotIds}
              />
            </li>
          ))}
        </ol>
      )}

      <SessionBar
        sessionId={session.id}
        dayLabel={selectedDay.label}
        dayNumber={selectedDay.day_number}
        week={week}
        status={session.status}
        performedAt={session.performed_at}
        loggedCount={loggedCount}
        totalSlots={daySlots.length}
      />
    </div>
  )
}

function Header({
  unit,
  children,
}: {
  unit: string
  children?: ReactNode
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="space-y-0.5">
        <span className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.2em] text-muted">
          <CalendarDays className="size-3.5" aria-hidden />
          Today · {unit}
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Log session</h1>
      </div>
      {children}
    </header>
  )
}
