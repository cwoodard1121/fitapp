import type { ExerciseSlot, Session, SetLog } from '@/lib/types'

/** Excludes rows created only by the session-wide readiness fan-out. */
export function hasExerciseHistorySignal(log: SetLog): boolean {
  return (
    log.actual_load != null ||
    log.best_reps != null ||
    log.actual_sets != null ||
    log.actual_rir != null ||
    log.pump != null ||
    log.pain != null ||
    log.enjoyment != null ||
    log.soreness != null ||
    log.performance != null ||
    log.hit_rir_override != null ||
    (log.notes?.trim().length ?? 0) > 0
  )
}

/**
 * Legacy feedback-only rows predate frozen numeric targets. They remain visible
 * in History, but must not replace the last objective carry used to prescribe
 * the following exposure.
 */
export function canCarryProgression(log: SetLog): boolean {
  return (
    log.actual_load != null ||
    log.best_reps != null ||
    log.actual_sets != null ||
    log.actual_rir != null ||
    log.target_load != null ||
    log.target_sets != null ||
    log.target_reps != null
  )
}

/** Timestamp that represents when the workout happened, not when it was edited. */
export function trainingLogTimestamp(log: SetLog): string {
  return (
    log.session_performed_at ??
    log.created_at ??
    log.session_created_at
  )
}

/** Stable identity for one program-schedule mesocycle week. */
export function trainingWeekKey(log: SetLog): string {
  return [
    log.session_program_id ?? 'legacy-program',
    log.session_schedule_version ?? 'legacy-schedule',
    log.session_mesocycle ?? 0,
    log.week,
  ].join(':')
}

/**
 * Keep logged retired rows in an unfinished session after a program edit. A
 * replacement is deferred unless it also received exercise-specific feedback,
 * so work already entered never disappears or becomes a blank row.
 */
export function mergeSessionExerciseSlots(
  activeSlots: ExerciseSlot[],
  historicalSlots: ExerciseSlot[],
  signaledSlotIds: ReadonlySet<string>,
): ExerciseSlot[] {
  const signaledHistorical = historicalSlots.filter((slot) =>
    signaledSlotIds.has(slot.id),
  )
  const historicalByCode = new Map(
    signaledHistorical.map((slot) => [slot.slot_code, slot]),
  )
  const historicalByLineage = new Map(
    signaledHistorical.map((slot) => [slot.lineage_slot_id ?? slot.id, slot]),
  )
  const historicalByOriginalOrder = new Map(
    signaledHistorical.map((slot) => [
      Math.abs(slot.order_index + 1_000_000),
      slot,
    ]),
  )
  const includedHistorical = new Set<string>()
  const merged = activeSlots.map((activeSlot) => {
    if (signaledSlotIds.has(activeSlot.id)) return activeSlot
    // Explicit lineage survives a simultaneous name/code/order edit. Code and
    // original order remain fallbacks for replacements made before lineage was
    // recorded.
    const historicalSlot =
      historicalByLineage.get(activeSlot.lineage_slot_id ?? activeSlot.id) ??
      historicalByCode.get(activeSlot.slot_code) ??
      historicalByOriginalOrder.get(activeSlot.order_index)
    if (!historicalSlot) return activeSlot
    includedHistorical.add(historicalSlot.id)
    return { ...historicalSlot, order_index: activeSlot.order_index }
  })

  for (const historicalSlot of signaledHistorical) {
    if (includedHistorical.has(historicalSlot.id)) continue
    const originalOrder = Math.abs(historicalSlot.order_index + 1_000_000)
    merged.push({ ...historicalSlot, order_index: originalOrder })
  }

  return merged.sort((a, b) => a.order_index - b.order_index)
}

/**
 * Attach session chronology/identity to flat logs and sort oldest to newest.
 * A retroactively entered older workout therefore stays in its performed-time
 * position instead of becoming the latest progression point.
 */
export function attachSessionContextToLogs(
  logs: SetLog[],
  sessions: Session[],
): SetLog[] {
  const sessionById = new Map(sessions.map((session) => [session.id, session]))
  return logs
    .map((log) => {
      const session = sessionById.get(log.session_id)
      return {
        ...log,
        session_performed_at: session?.performed_at ?? null,
        session_created_at: session?.created_at ?? null,
        session_mesocycle: session?.mesocycle ?? null,
        session_schedule_version: session?.schedule_version ?? null,
        session_program_id: session?.program_id ?? null,
      }
    })
    .sort(
      (a, b) =>
        trainingLogTimestamp(a).localeCompare(trainingLogTimestamp(b)) ||
        a.created_at.localeCompare(b.created_at) ||
        a.id.localeCompare(b.id),
    )
}
