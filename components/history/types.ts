import type { SessionStatus, Unit } from "@/lib/types"

/**
 * One row in the history list. Fully serializable so it can cross the
 * server -> client boundary into <HistoryList>.
 */
export interface HistorySessionVM {
  id: string
  /** Mesocycle week (1..length_weeks). */
  week: number
  /** 1-based mesocycle number derived from the performed date. */
  mesocycle: number
  dayLabel: string
  status: SessionStatus
  /** ISO timestamp used for the displayed date (performed_at or created_at). */
  dateIso: string
  /** True when performed_at was set (vs. falling back to created_at). */
  dated: boolean
  /** Distinct exercise names with a logged set this session. */
  exercises: string[]
  /** Count of slots with a logged set. */
  exerciseCount: number
  /** Total tonnage (sets x reps x load) across logged slots. */
  tonnage: number
}

export interface HistoryListData {
  sessions: HistorySessionVM[]
  exerciseNames: string[]
  unit: Unit
}
