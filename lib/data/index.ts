/**
 * Shared data-access layer. Feature screens import from here so query logic
 * lives in one place. All reads/writes use the server Supabase client and are
 * scoped to the authenticated user (RLS enforces this server-side too).
 */
export { requireUserId } from '@/lib/data/auth'
export { getProfile, ensureProfile } from '@/lib/data/profile'
export {
  getActiveProgram,
  getPrograms,
  getProgramFull,
  getSlotsForDay,
  createProgram,
  setActiveProgram,
  deleteProgram,
  setProgramStartDate,
} from '@/lib/data/programs'
export { seedDefaultProgram } from '@/lib/data/seed'
export { weekForDate, mesocycleNumber } from '@/lib/data/week'
export {
  ensureWeekSessions,
  getSessionForDay,
  getSetLogsForSession,
  getSetEntriesForSession,
  getPrevDecisionForSlot,
  computeSlotTargets,
  buildTodayView,
} from '@/lib/data/sessions'
export {
  slotConfigFromRow,
  setLogInputFromRow,
  derivePrevTargets,
  type PrevTargets,
} from '@/lib/data/mappers'

// Canonical view-model types live in @/lib/types; re-export for convenience.
export type { ProgramFull, SlotTargets, SlotView } from '@/lib/types'
