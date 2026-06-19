import { createClient } from "@/lib/supabase/server"
import {
  requireUserId,
  getProfile,
  getActiveProgram,
  mesocycleNumber,
} from "@/lib/data"
import type {
  ExerciseSlot,
  ProgramDay,
  Session,
  SetLog,
} from "@/lib/types"
import { HistoryList } from "@/components/history/history-list"
import type { HistorySessionVM } from "@/components/history/types"

export const metadata = { title: "History" }

function isLogged(log: SetLog): boolean {
  return (
    log.actual_load != null ||
    log.best_reps != null ||
    log.actual_sets != null ||
    log.actual_rir != null
  )
}

export default async function HistoryPage() {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)

  const [profile, program] = await Promise.all([
    getProfile(),
    getActiveProgram(),
  ])
  const unit = profile?.unit ?? "lb"
  const lengthWeeks = program?.length_weeks ?? 4

  const [sessionsRes, logsRes, slotsRes, daysRes] = await Promise.all([
    supabase.from("sessions").select("*").eq("user_id", userId),
    supabase.from("set_logs").select("*").eq("user_id", userId),
    supabase.from("exercise_slots").select("*").eq("user_id", userId),
    supabase.from("program_days").select("*").eq("user_id", userId),
  ])

  if (sessionsRes.error) throw sessionsRes.error
  if (logsRes.error) throw logsRes.error
  if (slotsRes.error) throw slotsRes.error
  if (daysRes.error) throw daysRes.error

  const sessions = (sessionsRes.data as Session[]) ?? []
  const logs = (logsRes.data as SetLog[]) ?? []
  const slots = (slotsRes.data as ExerciseSlot[]) ?? []
  const days = (daysRes.data as ProgramDay[]) ?? []

  const slotName = new Map(slots.map((s) => [s.id, s.exercise_name]))
  const dayLabel = new Map(days.map((d) => [d.id, d.label]))

  // Group logged sets by session.
  const logsBySession = new Map<string, SetLog[]>()
  for (const log of logs) {
    if (!isLogged(log)) continue
    const list = logsBySession.get(log.session_id)
    if (list) list.push(log)
    else logsBySession.set(log.session_id, [log])
  }

  const allExercises = new Set<string>()

  const vms: HistorySessionVM[] = sessions
    .filter((s) => {
      const hasLogs = (logsBySession.get(s.id)?.length ?? 0) > 0
      return s.status === "done" || s.status === "in_progress" || hasLogs
    })
    .map((s) => {
      const sessionLogs = logsBySession.get(s.id) ?? []

      const exerciseNames = new Set<string>()
      let tonnage = 0
      for (const log of sessionLogs) {
        const name = slotName.get(log.slot_id)
        if (name) {
          exerciseNames.add(name)
          allExercises.add(name)
        }
        if (
          log.actual_sets != null &&
          log.best_reps != null &&
          log.actual_load != null
        ) {
          tonnage += log.actual_sets * log.best_reps * log.actual_load
        }
      }

      const dateIso = s.performed_at ?? s.created_at
      const mesocycle =
        mesocycleNumber(profile?.start_date, lengthWeeks, new Date(dateIso)) + 1

      return {
        id: s.id,
        week: s.week,
        mesocycle,
        dayLabel: dayLabel.get(s.day_id) ?? "Workout",
        status: s.status,
        dateIso,
        dated: s.performed_at != null,
        exercises: [...exerciseNames].sort(),
        exerciseCount: exerciseNames.size,
        tonnage,
      } satisfies HistorySessionVM
    })

  // Most recent first.
  vms.sort((a, b) => b.dateIso.localeCompare(a.dateIso))

  const exerciseNames = [...allExercises].sort((a, b) => a.localeCompare(b))

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5">
      <header className="mb-4 space-y-1">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
          simplegym
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="text-sm text-muted">
          Past sessions, what you lifted, and what the engine decided.
        </p>
      </header>

      <HistoryList
        sessions={vms}
        exerciseNames={exerciseNames}
        unit={unit}
      />
    </div>
  )
}
