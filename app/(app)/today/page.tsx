import {
  getProfile,
  getActiveProgram,
  getProgramFull,
  getSessionForDay,
  getSetLogsForSession,
  ensureWeekSessions,
  buildTodayView,
  weekForDate,
  mesocycleNumber,
  resolveTrainingWeek,
  requireUserId,
} from '@/lib/data'
import type {
  AnalysisPayload,
  ExerciseSlot,
  Program,
  RecoveryMetric,
  Session,
  SessionStatus,
} from '@/lib/types'
import { getAnalysisAccess } from '@/lib/ai/allowlist'
import { getLatestAnalysis } from '@/lib/ai/analysis'
import { createClient } from '@/lib/supabase/server'
import { getRecoveryRange } from '@/lib/wearables/store'
import { computeRecoveryScore, suggestedReadiness, type RecoveryScore } from '@/lib/recovery/score'
import type { LiftAdvice } from '@/lib/types'
import { exerciseNameKey } from '@/lib/exercises/identity'
import {
  hasExerciseHistorySignal,
  mergeSessionExerciseSlots,
} from '@/lib/data/training-history'
import { Badge } from '@/components/ui/badge'
import { dayName } from '@/lib/utils'
import { ExerciseAdvice } from '@/components/today/exercise-advice'
import { WeekSelector } from '@/components/today/week-selector'
import { DaySelector } from '@/components/today/day-selector'
import { SessionReadiness } from '@/components/today/session-readiness'
import { SlotRow } from '@/components/today/slot-row'
import { SessionBar } from '@/components/today/session-bar'
import { EmptyState } from '@/components/today/empty-state'
import { SessionBand, type BandSegment } from '@/components/today/session-band'

export const dynamic = 'force-dynamic'

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{
    day?: string | string[]
    week?: string | string[]
  }>
}) {
  const params = await searchParams
  const dayParam = typeof params.day === 'string' ? params.day : undefined

  const [profile, program] = await Promise.all([
    getProfile(),
    getActiveProgram(),
  ])

  const unit = profile?.unit ?? 'lb'
  const supabase = await createClient()
  const userId = await requireUserId(supabase)

  // No program -> friendly empty state with the next action.
  if (!program) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-4">
        <EmptyState />
      </div>
    )
  }

  // Coaching + recovery inputs don't depend on the session branch below, so
  // start them now and await them only once the slots are built.
  const coachingPromise = loadCoachingInputs(supabase, userId, program)
  coachingPromise.catch(() => {})

  const full = await getProgramFull(program.id)
  if (!full || full.days.length === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-4">
        <EmptyState />
      </div>
    )
  }

  // Each program owns its mesocycle anchor; a null start_date means Week 1.
  const startDate = program.start_date
  const currentWeek = weekForDate(startDate, program.length_weeks)
  // No explicit ?week= -> reopen on the athlete's last manual pick (if still
  // in range) rather than snapping back to the calendar-derived current week.
  // An explicit ?week= (from the strip, or a bookmarked link) always wins.
  const remembered = profile?.last_selected_week
  const defaultWeek =
    remembered != null && remembered >= 1 && remembered <= program.length_weeks
      ? remembered
      : currentWeek
  const week = resolveTrainingWeek(
    params.week,
    defaultWeek,
    program.length_weeks,
  )
  const meso = mesocycleNumber(startDate, program.length_weeks)
  const isDeload = week === program.deload_week

  // Sessions for the whole week so the day selector can show progress and we
  // can default to the next unlogged day.
  const weekSessions = await ensureWeekSessions(
    program.id,
    week,
    meso,
    program.schedule_version,
  )
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
    (await getSessionForDay(
      program.id,
      selectedDay.id,
      week,
      meso,
      program.schedule_version,
    ))

  let daySlots = full.slots
    .filter((s) => s.day_id === selectedDay.id)
    .sort((a, b) => a.order_index - b.order_index)

  const logs = await getSetLogsForSession(session.id)
  // If the program is edited after this workout has started, keep any logged
  // retired exercise in this session and hide its same-code replacement until
  // the next exposure. Program edits therefore cannot make entered work vanish
  // or turn the session into a blank replacement row.
  const activeSlotIds = new Set(daySlots.map((slot) => slot.id))
  const historicalSlotIds = [
    ...new Set(
      Object.values(logs)
        .filter(hasExerciseHistorySignal)
        .map((log) => log.slot_id)
        .filter((slotId) => !activeSlotIds.has(slotId)),
    ),
  ]
  if (historicalSlotIds.length > 0) {
    const { data: historicalRows, error: historicalError } = await supabase
      .from('exercise_slots')
      .select('*')
      .eq('user_id', userId)
      .eq('day_id', selectedDay.id)
      .in('id', historicalSlotIds)
    if (historicalError) throw historicalError

    daySlots = mergeSessionExerciseSlots(
      daySlots,
      (historicalRows ?? []) as ExerciseSlot[],
      new Set(
        Object.values(logs)
          .filter(hasExerciseHistorySignal)
          .map((log) => log.slot_id),
      ),
    )
  }

  const slotViews = await buildTodayView(
    session,
    daySlots,
    logs,
    program.deload_week,
    profile?.readiness_weights ?? undefined,
  )

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

  const { payload, recoveryScore } = await coachingPromise

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

  const segments: BandSegment[] = slotViews.map((v) => ({
    slotId: v.slot.id,
    code: v.slot.slot_code,
    name: v.slot.exercise_name,
    logged:
      v.entries.some((e) => e.reps != null) ||
      (v.log != null && (v.log.best_reps != null || v.log.actual_sets != null)),
  }))

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-session-room pt-3 md:pb-28">
      <WeekSelector
        lengthWeeks={program.length_weeks}
        selectedWeek={week}
        currentWeek={currentWeek}
      />

      <div className="mt-2">
        <DaySelector
          days={full.days}
          selectedDayId={selectedDay.id}
          statusByDay={statusByDay}
          weekOverride={week === currentWeek ? undefined : week}
        />
      </div>

      <header className="mt-5">
        <h1 className="text-[2.125rem] font-extrabold lowercase leading-[1.05] tracking-[-0.03em] font-wide">
          {dayName(selectedDay.label)}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm font-semibold text-muted">
          <span className="font-mono">day {selectedDay.day_number}</span>
          <span aria-hidden>·</span>
          <span className="font-mono">
            week {week} of {program.length_weeks}
          </span>
          {meso > 0 ? (
            <>
              <span aria-hidden>·</span>
              <span className="font-mono">meso {meso + 1}</span>
            </>
          ) : null}
          <span aria-hidden>·</span>
          <span>{unit}</span>
          {isDeload ? <Badge variant="warning">deload week</Badge> : null}
        </div>
      </header>

      {segments.length > 0 ? (
        <div className="mt-4">
          <SessionBand segments={segments} done={session.status === 'done'} />
        </div>
      ) : null}

      {daySlots.length > 0 ? (
        <div className="mt-4">
          <SessionReadiness
            key={session.id}
            sessionId={session.id}
            week={week}
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
          <p className="text-base font-bold">Nothing on this day yet.</p>
          <p className="mt-1 text-sm text-muted">
            Add exercises to {selectedDay.label} in the program editor.
          </p>
        </div>
      ) : (
        <ol className="mt-4 space-y-4">
          {slotViews.map((view) => (
            <li key={`${session.id}:${view.slot.id}`}>
              <SlotRow
                view={view}
                sessionId={session.id}
                week={week}
                unit={unit}
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

async function loadCoachingInputs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  program: Program,
): Promise<{
  payload: AnalysisPayload | null
  recoveryScore: RecoveryScore | null
}> {
  // AI coaching and the wearable recovery score are gated to allowed accounts.
  const { allowed } = await getAnalysisAccess()
  if (!allowed) return { payload: null, recoveryScore: null }

  const [analysis, blocksRes, recent] = await Promise.all([
    getLatestAnalysis(),
    supabase
      .from('blocks')
      .select('program_id,phase,start_date')
      .eq('user_id', userId)
      .eq('kind', 'training')
      .eq('is_active', true)
      .order('start_date', { ascending: false }),
    getRecoveryRange(supabase, userId, 35),
  ])
  if (blocksRes.error) throw blocksRes.error
  const trainingBlockRows = blocksRes.data
  const trainingBlock =
    trainingBlockRows?.find((block) => block.program_id === program.id) ??
    trainingBlockRows?.find((block) => block.program_id == null) ??
    trainingBlockRows?.[0] ??
    null

  // Not displayed on Today (that card lives on Check-in) but it feeds the
  // readiness auto-suggestion.
  let latestRecovery: RecoveryMetric | null = null
  for (let i = recent.length - 1; i >= 0; i--) {
    if (recent[i].steps != null || recent[i].sleep_minutes_asleep != null) {
      latestRecovery = recent[i]
      break
    }
  }
  const recoveryScore = latestRecovery
    ? computeRecoveryScore(recent, latestRecovery.metric_date, {
        baselineStart: trainingBlock?.start_date ?? program.start_date,
      })
    : null

  return { payload: analysis?.payload ?? null, recoveryScore }
}
