/**
 * simplegym autoregulation engine — the heart of the app.
 *
 * Pure and side-effect free: no imports, no I/O, no globals. Every output is a
 * deterministic function of its inputs so it can run identically on the server
 * (data layer) and the client (UI explanations) and be unit-tested in isolation.
 *
 * Ported verbatim from the spreadsheet spec. The derived flags, growth score,
 * recovery gate, volume signal and the first-match-wins decision ladder are LAW
 * — do not "improve" them here; tune the program config instead.
 */

/* ------------------------------------------------------------------ */
/* Public types (names are LAW — the data layer + UI import these)     */
/* ------------------------------------------------------------------ */

export type ProgressBias = 'Load +5' | 'Reps first' | 'Set optional'
export type Performance = 'Up' | 'Same' | 'Down'
export type RirOverride = 'Y' | 'N' | 'Skip'
export type Gate = 'Green' | 'Yellow' | 'Red'

export type Decision =
  | 'Add 5 lb'
  | 'Add 1 rep'
  | 'Add 1 set'
  | 'Maintain'
  | 'Hold/reduce'
  | 'Skip'
  | 'Deload / maintain'
  | 'Calibrate (set baseline)'
  | null

export interface SlotConfig {
  progressBias: ProgressBias
  repLow: number
  repHigh: number
  targetRir: number
  baseSets: number
  loadIncrement: number
  seedLoad: number | null
}

export interface SetLogInput {
  actualLoad: number | null
  bestReps: number | null
  actualSets: number | null
  actualRir: number | null
  hitRirOverride: RirOverride | null
  pump: number | null
  enjoyment: number | null
  soreness: number | null
  recovery: number | null
  performance: Performance | null
}

export interface EngineContext {
  week: number
  deloadWeek: number
  prevNextLoad?: number | null
  prevNextSets?: number | null
  prevNextReps?: number | null
}

export interface EngineResult {
  decision: Decision
  decisionLabel: string
  reason: string
  score: number
  gate: Gate
  hitRir: string | null
  e1rm: number | null
  tonnage: number | null
  nextLoad: number | null
  nextSets: number | null
  nextReps: number | null
  flags: Record<string, boolean>
}

/* ------------------------------------------------------------------ */
/* e1RM (Epley)                                                        */
/* ------------------------------------------------------------------ */

/** Estimated 1RM via the Epley formula: load * (1 + reps / 30). Unrounded. */
export function epley1RM(load: number, reps: number): number {
  return load * (1 + reps / 30)
}

/** Round a value to one decimal place (used for the displayed e1RM). */
function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/* ------------------------------------------------------------------ */
/* Per-week target derivation                                          */
/* ------------------------------------------------------------------ */

/**
 * Sets to prescribe for a slot in a given week.
 *  - week 1 (calibration): the slot's base set count.
 *  - deload week: 60% of last week's carry-forward sets, rounded, floored at 1.
 *  - otherwise: last week's carry-forward sets (or base sets if none yet).
 */
export function targetSets(
  week: number,
  deloadWeek: number,
  slot: SlotConfig,
  prevNextSets: number | null,
): number {
  if (week === 1) return slot.baseSets
  if (week === deloadWeek) {
    return Math.max(1, Math.round((prevNextSets ?? slot.baseSets) * 0.6))
  }
  return prevNextSets ?? slot.baseSets
}

/**
 * Load to prescribe for a slot in a given week.
 *  - week 1 (calibration): the slot's seed load (0 if unseeded / bodyweight).
 *  - deload week: 90% of last week's carry-forward load, rounded.
 *  - otherwise: last week's carry-forward load (or seed load if none yet).
 */
export function targetLoad(
  week: number,
  deloadWeek: number,
  slot: SlotConfig,
  prevNextLoad: number | null,
): number {
  if (week === 1) return slot.seedLoad ?? 0
  if (week === deloadWeek) {
    return Math.round((prevNextLoad ?? slot.seedLoad ?? 0) * 0.9)
  }
  return prevNextLoad ?? slot.seedLoad ?? 0
}

/* ------------------------------------------------------------------ */
/* The autoregulation evaluation                                       */
/* ------------------------------------------------------------------ */

/**
 * Evaluate one exercise slot for one session and return the engine's call:
 * the decision, a display label, a one-line reason, the growth score, the
 * recovery gate, derived metrics (hit-RIR, e1RM, tonnage), the carry-forward
 * next targets, and the raw boolean flags so the UI can explain itself.
 */
export function evaluateSlot(
  log: SetLogInput,
  slot: SlotConfig,
  ctx: EngineContext,
): EngineResult {
  const { progressBias, repLow, repHigh, targetRir, baseSets, loadIncrement } = slot
  const { week, deloadWeek } = ctx
  const {
    actualLoad,
    bestReps,
    actualSets,
    actualRir,
    hitRirOverride,
    pump,
    enjoyment,
    soreness,
    recovery,
    performance,
  } = log

  /* --- Derived values --- */
  const maxRep = repHigh

  const hitRirAuto: string | null =
    actualRir == null
      ? null
      : actualRir < targetRir - 0.5
        ? 'N - too hard'
        : actualRir > targetRir + 2
          ? 'N - too easy'
          : 'Y'

  // Override wins over the auto read; produces 'Y' | 'N' | 'Skip' | auto string.
  const status: string | null = hitRirOverride ?? hitRirAuto

  /* --- Derived boolean flags --- */
  const lowrir = actualRir != null && actualRir < targetRir - 0.5
  const verylowrir = actualRir != null && actualRir < targetRir - 2
  const tooeasy = actualRir != null && actualRir > targetRir + 2
  const badpump = pump != null && pump <= 5
  const goodpump = pump != null && pump >= 7
  const lowsore = soreness != null && soreness <= 5
  const highsore = soreness != null && soreness >= 8
  const goodrecovery = recovery != null && recovery >= 7
  const badrecovery = recovery != null && recovery <= 4
  const perfdown = performance === 'Down'
  const perfup = performance === 'Up'
  const perfok = performance == null || performance === 'Same' || performance === 'Up'

  /* --- Growth score --- */
  const score =
    (goodrecovery ? 2 : badrecovery ? -3 : 0) +
    (perfup ? 1 : perfdown ? -2 : 0) +
    (goodpump ? 2 : badpump ? 1 : 0) +
    (enjoyment != null && enjoyment >= 7 ? 1 : 0) +
    (soreness != null && soreness >= 3 && soreness <= 7
      ? 1
      : highsore && !goodrecovery
        ? -2
        : 0) +
    (tooeasy ? 1 : lowrir ? -1 : 0)

  /* --- Recovery gate --- */
  const gate: Gate =
    badrecovery ||
    (perfdown && !goodrecovery) ||
    (highsore && !goodrecovery) ||
    (verylowrir && !goodrecovery && (perfdown || highsore))
      ? 'Red'
      : goodrecovery
        ? 'Green'
        : 'Yellow'

  /* --- Volume signal --- */
  const addSet =
    progressBias !== 'Load +5' &&
    goodrecovery &&
    perfok &&
    (badpump || lowsore) &&
    (actualSets == null || actualSets < 4)

  const noData =
    actualLoad == null && bestReps == null && actualSets == null && actualRir == null

  /* --- Decision: FIRST MATCH WINS, in this exact order --- */
  let decision: Decision
  let reason: string

  if (week === deloadWeek) {
    decision = 'Deload / maintain'
    reason = 'Deload week -> maintain'
  } else if (week === 1) {
    decision = 'Calibrate (set baseline)'
    reason = 'Week 1 -> set your baseline'
  } else if (noData) {
    decision = null
    reason = 'No set logged yet -> nothing to evaluate'
  } else if (status === 'Skip') {
    decision = 'Skip'
    reason = 'Marked skip -> no change'
  } else if (gate === 'Red') {
    decision = 'Hold/reduce'
    reason = 'Recovery red -> hold/reduce'
  } else if (addSet) {
    decision = 'Add 1 set'
    reason = 'Low pump + low soreness + good recovery -> add volume, not load'
  } else if (perfok && goodrecovery && !lowrir && (score >= 5 || tooeasy)) {
    if (progressBias === 'Load +5') {
      decision = 'Add 5 lb'
      reason = tooeasy
        ? 'Reps to spare with good recovery -> add load'
        : 'Strong session with good recovery -> add load'
    } else if (progressBias === 'Reps first') {
      if (bestReps != null && bestReps + 1 > maxRep) {
        decision = 'Add 5 lb'
        reason = 'Hit top of rep range with reps to spare -> add load'
      } else {
        decision = 'Add 1 rep'
        reason = 'Strong session in range -> add a rep'
      }
    } else if (progressBias === 'Set optional') {
      decision = 'Add 1 set'
      reason = 'Strong session -> add a set'
    } else {
      decision = 'Maintain'
      reason = 'On track -> maintain'
    }
  } else if (tooeasy && perfok && progressBias === 'Load +5') {
    decision = 'Add 5 lb'
    reason = 'Too easy -> add load'
  } else {
    decision = 'Maintain'
    reason = 'Hold steady -> repeat and progress next time'
  }

  /* --- Display label: substitute the real increment for "Add 5 lb" --- */
  const decisionLabel =
    decision === null
      ? '—'
      : decision === 'Add 5 lb'
        ? `Add ${loadIncrement} lb`
        : decision

  /* --- Carry-forward next targets (keyed off the canonical decision) --- */
  const nextLoad =
    decision === 'Add 5 lb'
      ? (actualLoad ?? 0) + loadIncrement
      : decision === 'Hold/reduce'
        ? Math.max(0, (actualLoad ?? 0) - loadIncrement)
        : actualLoad

  const nextSets =
    decision === 'Add 1 set'
      ? (actualSets ?? baseSets) + 1
      : decision === 'Hold/reduce'
        ? Math.max(1, (actualSets ?? baseSets) - 1)
        : actualSets

  const nextReps =
    decision === 'Add 1 rep' ? (bestReps ?? repLow) + 1 : bestReps

  /* --- Derived metrics --- */
  const e1rm =
    actualLoad != null && bestReps != null
      ? round1(epley1RM(actualLoad, bestReps))
      : null

  const tonnage =
    actualSets != null && bestReps != null && actualLoad != null
      ? actualSets * bestReps * actualLoad
      : null

  /* --- Flags for UI explanation --- */
  const flags: Record<string, boolean> = {
    lowrir,
    verylowrir,
    tooeasy,
    badpump,
    goodpump,
    lowsore,
    highsore,
    goodrecovery,
    badrecovery,
    perfdown,
    perfup,
    perfok,
    addSet,
  }

  return {
    decision,
    decisionLabel,
    reason,
    score,
    gate,
    hitRir: status,
    e1rm,
    tonnage,
    nextLoad,
    nextSets,
    nextReps,
    flags,
  }
}
