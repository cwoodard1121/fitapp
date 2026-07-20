import type { ExerciseSlot, SetLog } from '@/lib/types'
import type {
  EngineContext,
  EngineResult,
  SetLogInput,
  SlotConfig,
} from '@/lib/engine/engine'
import { evaluateSlot, epley1RM } from '@/lib/engine/engine'

export interface SetEntryValues {
  load: number | null
  reps: number | null
  rir: number | null
}

export interface SetAggregate {
  actual_load: number | null
  best_reps: number | null
  actual_sets: number | null
  actual_rir: number | null
}

/**
 * Collapse a slot's individual sets into the aggregate the engine reads. The
 * "best set" is selected only by objective load × completed reps (highest Epley
 * e1RM, falling back to most reps). It drives the aggregate load/reps, while the
 * count of real sets drives volume. RIR is carried separately for progression
 * decisions and never changes e1RM.
 */
export function aggregateFromEntries(entries: SetEntryValues[]): SetAggregate {
  const real = entries.filter((e) => e.load != null || e.reps != null)
  if (real.length === 0) {
    return { actual_load: null, best_reps: null, actual_sets: null, actual_rir: null }
  }

  let best: SetEntryValues | null = null
  let bestScore = -Infinity
  for (const e of real) {
    if (e.load != null && e.reps != null) {
      const score = epley1RM(e.load, e.reps)
      if (score > bestScore) {
        bestScore = score
        best = e
      }
    }
  }
  if (!best) {
    best = real.reduce(
      (a, b) => ((b.reps ?? -1) > (a.reps ?? -1) ? b : a),
      real[0],
    )
  }

  const rirs = real
    .map((e) => e.rir)
    .filter((r): r is number => r != null)
  const actual_rir =
    best.rir != null ? best.rir : rirs.length ? Math.min(...rirs) : null

  return {
    actual_load: best.load,
    best_reps: best.reps,
    actual_sets: real.length,
    actual_rir,
  }
}

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
    isBodyweight: row.is_bodyweight ?? false,
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
