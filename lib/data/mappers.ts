import type { ExerciseSlot, SetLog } from '@/lib/types'
import type {
  EngineContext,
  EngineResult,
  SetLogInput,
  SlotConfig,
} from '@/lib/engine/engine'
import { evaluateSlot } from '@/lib/engine/engine'

/**
 * Map an exercise_slots row (snake_case) to the engine's SlotConfig (camelCase).
 */
export function slotConfigFromRow(row: ExerciseSlot): SlotConfig {
  return {
    progressBias: row.progress_bias,
    repLow: row.rep_low,
    repHigh: row.rep_high,
    targetRir: row.target_rir,
    baseSets: row.base_sets,
    loadIncrement: row.load_increment,
    seedLoad: row.seed_load,
  }
}

/**
 * Map a set_logs row (or null when nothing logged yet) to the engine input.
 * A null row produces an all-null input, which the engine reads as "no data".
 */
export function setLogInputFromRow(row: SetLog | null | undefined): SetLogInput {
  return {
    actualLoad: row?.actual_load ?? null,
    bestReps: row?.best_reps ?? null,
    actualSets: row?.actual_sets ?? null,
    actualRir: row?.actual_rir ?? null,
    hitRirOverride: row?.hit_rir_override ?? null,
    pump: row?.pump ?? null,
    enjoyment: row?.enjoyment ?? null,
    soreness: row?.soreness ?? null,
    recovery: row?.recovery ?? null,
    performance: row?.performance ?? null,
  }
}

export interface PrevTargets {
  prevNextLoad: number | null
  prevNextSets: number | null
  prevNextReps: number | null
}

/**
 * Derive the carry-forward targets (next load/sets/reps) implied by the
 * previous week's logged set, by running the engine for that prior week.
 * Decisions are NEVER stored — they are computed on read.
 */
export function derivePrevTargets(
  config: SlotConfig,
  prevLog: SetLog | null | undefined,
  prevWeek: number,
  deloadWeek: number,
): PrevTargets {
  if (!prevLog) {
    return { prevNextLoad: null, prevNextSets: null, prevNextReps: null }
  }
  const ctx: EngineContext = { week: prevWeek, deloadWeek }
  const res: EngineResult = evaluateSlot(setLogInputFromRow(prevLog), config, ctx)
  return {
    prevNextLoad: res.nextLoad,
    prevNextSets: res.nextSets,
    prevNextReps: res.nextReps,
  }
}
