/**
 * simplegym autoregulation engine — the heart of the app.
 *
 * Pure and side-effect free: no imports, no I/O, no globals. Every output is a
 * deterministic function of its inputs so it can run identically on the server
 * (data layer) and the client (UI explanations) and be unit-tested in isolation.
 *
 * Two layers:
 *  1. Derived readiness flags, a configurable growth score, hard safety gates,
 *     and a first-match-wins decision ladder.
 *  2. A progression layer tuned for a returning/detrained lifter: objective
 *     performance can drive progress without requiring perfect RIR, easy work
 *     can move faster, and under-stimulated work can earn another set.
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
  | 'Add 2 reps'
  | 'Add 1 rep'
  | 'Add 1 set'
  | 'Maintain'
  | 'Hold/reduce'
  | 'Skip'
  | 'Deload / maintain'
  | 'Calibrate (set baseline)'
  | null

/**
 * Readiness-score weights. The Settings screen can tune them. Pass via
 * EngineContext.weights to override.
 */
export interface ReadinessWeights {
  recoveryGood: number
  recoveryBad: number
  perfUp: number
  perfDown: number
  pumpGood: number
  pumpBad: number
  enjoyment: number
  rirTooEasy: number
  rirLow: number
}

export const DEFAULT_WEIGHTS: ReadinessWeights = {
  recoveryGood: 2,
  recoveryBad: -3,
  perfUp: 1,
  perfDown: -2,
  pumpGood: 2,
  // Low pump is a possible volume signal, not positive growth feedback.
  // Custom settings may still opt into weighting it.
  pumpBad: 0,
  enjoyment: 1,
  // RIR is context, not the primary progression signal. Ordinary variance
  // nudges the score; near-failure work is handled by a safety check below.
  rirTooEasy: 0.5,
  rirLow: -0.5,
}

export interface SlotConfig {
  progressBias: ProgressBias
  repLow: number
  repHigh: number
  targetRir: number
  baseSets: number
  loadIncrement: number
  seedLoad: number | null
  /**
   * Whether this exercise may earn an evidence-based optional set. Progression
   * bias and bodyweight status are not reliable proxies for volume eligibility.
   */
  allowSetProgression: boolean
  /**
   * Bodyweight movement (pull-up, dip, bodyweight squat). When true the engine
   * progresses by REPS then SETS only and never returns an automatic "Add 5 lb"
   * — load is the user's call (e.g. strapping on a belt), not something the app
   * prescribes. Defaults to false; an unseeded barbell lift (seedLoad null) is
   * NOT bodyweight, it just calibrates its load from the first session.
   */
  isBodyweight: boolean
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
  /**
   * Soreness reported the day after this exercise trained its muscle, on the
   * same 0-10 scale as soreness. Optional so existing logs remain valid until
   * day-after feedback is persisted and mapped.
   *
   * This is a weak stimulus check, not a growth score: low next-day soreness
   * can help justify one extra set only when the rest of the session agrees.
   * High values remain useful as a recovery safety signal.
   */
  nextDaySoreness?: number | null
  /**
   * Exercise/joint pain reported after the exposure, on a 0-10 scale.
   * Optional so historical logs and existing callers remain valid.
   */
  pain?: number | null
  recovery: number | null
  performance: Performance | null
}

export interface EngineContext {
  week: number
  deloadWeek: number
  prevNextLoad?: number | null
  prevNextSets?: number | null
  prevNextReps?: number | null
  /**
   * Snapshot of what was prescribed for the completed exposure. When present,
   * these values are the objective progression bar. Callers without a snapshot
   * retain the configured-range fallback.
   */
  prescribedLoad?: number | null
  prescribedSets?: number | null
  prescribedReps?: number | null
  prescribedRir?: number | null
  /** Optional tuned readiness weights; defaults to DEFAULT_WEIGHTS. */
  weights?: ReadinessWeights
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

/**
 * Objective estimated 1RM via Epley. Only performed load and completed reps
 * belong here; subjective RIR is deliberately excluded.
 */
export function epley1RM(load: number, completedReps: number): number {
  return load * (1 + completedReps / 30)
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
 * Evaluate one exercise slot and return the next-session prescription it creates:
 * the decision, a display label, a one-line reason, the growth score, the
 * recovery gate, derived metrics (hit-RIR, e1RM, tonnage), the carry-forward
 * next targets, and the raw boolean flags so the UI can explain itself.
 */
export function evaluateSlot(
  log: SetLogInput,
  slot: SlotConfig,
  ctx: EngineContext,
): EngineResult {
  const {
    progressBias,
    repLow,
    repHigh,
    targetRir: configuredTargetRir,
    baseSets,
    loadIncrement,
    isBodyweight,
  } = slot
  const { week, deloadWeek } = ctx
  const targetRir = ctx.prescribedRir ?? configuredTargetRir
  const {
    actualLoad,
    bestReps,
    actualSets,
    actualRir,
    hitRirOverride,
    pump,
    enjoyment,
    soreness,
    nextDaySoreness,
    pain,
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
  const rirValidated = hitRirOverride === 'Y'
  const rirMissed = hitRirOverride === 'N'
  // An explicit "Y" confirms that the intended intensity was achieved and
  // supersedes a noisy numeric RIR estimate.
  const useNumericRir = !rirValidated
  const lowrir =
    useNumericRir && actualRir != null && actualRir < targetRir - 0.5
  const verylowrir =
    useNumericRir &&
    actualRir != null &&
    targetRir >= 2 &&
    actualRir <= targetRir - 2
  const tooeasy =
    useNumericRir && actualRir != null && actualRir > targetRir + 2
  const badpump = pump != null && pump <= 5
  const goodpump = pump != null && pump >= 7
  const lowsore = soreness != null && soreness <= 2
  const productivesore = soreness != null && soreness >= 3 && soreness <= 6
  const incominghighsore = soreness != null && soreness >= 8
  const incomingseveresore = soreness != null && soreness >= 10
  const nextdaysoreknown = nextDaySoreness != null
  const nextdaylowsore = nextDaySoreness != null && nextDaySoreness <= 2
  const nextdayproductivesore =
    nextDaySoreness != null && nextDaySoreness >= 3 && nextDaySoreness <= 7
  const nextdayhighsore = nextDaySoreness != null && nextDaySoreness >= 8
  const nextdayseveresore = nextDaySoreness != null && nextDaySoreness >= 10
  // Only next-day soreness belongs to the next-exposure recovery gate.
  const highsore = nextdayhighsore
  const severesore = nextdayseveresore
  const highpain = pain != null && pain >= 5
  const severepain = pain != null && pain >= 8
  const goodrecovery = recovery != null && recovery >= 7
  const badrecovery = recovery != null && recovery <= 4
  const perfdown = performance === 'Down'
  const perfup = performance === 'Up'
  const perfok = performance == null || performance === 'Same' || performance === 'Up'

  /* --- Growth score (weighted; defaults reproduce the spreadsheet) --- */
  const w = ctx.weights ?? DEFAULT_WEIGHTS
  const score =
    (goodrecovery ? w.recoveryGood : badrecovery ? w.recoveryBad : 0) +
    (perfup ? w.perfUp : perfdown ? w.perfDown : 0) +
    (goodpump ? w.pumpGood : badpump ? w.pumpBad : 0) +
    (enjoyment != null && enjoyment >= 7 ? w.enjoyment : 0) +
    // Soreness is intentionally excluded from the growth score. It can support
    // a stimulus/recovery decision below, but it is not evidence of growth.
    (tooeasy ? w.rirTooEasy : lowrir ? w.rirLow : 0)

  /* --- Recovery gate --- */
  const riskSignalCount =
    Number(badrecovery) +
    Number(perfdown) +
    Number(nextdayhighsore) +
    Number(verylowrir)
  const hardSafetyStop = nextdayseveresore || severepain
  const gate: Gate =
    hardSafetyStop || riskSignalCount >= 2
      ? 'Red'
      : goodrecovery && riskSignalCount === 0 && !highpain
        ? 'Green'
        : 'Yellow'

  /* === PROGRESSION LAYER ============================================
   * A completed, in-range session progresses by default. Subjective feedback
   * can stop progression when it identifies real regression/recovery trouble,
   * but a merely neutral score no longer forces repeated cautious holds.
   *
   * Set additions have a much higher bar. A slot may earn at most one set
   * above its configured baseline, and only with an explicit day-after signal
   * that agrees with low pump plus solid objective work and appropriate effort.
   */
  const SET_CAP = Math.min(5, baseSets + 1)

  // Clearly more in the tank than the +2 "too easy" -> the load is too light.
  const veryeasy =
    useNumericRir && actualRir != null && actualRir >= targetRir + 3
  const canVolume = slot.allowSetProgression

  // Objective completion is the default progression signal. The score remains
  // useful context, but neutral subjective feedback no longer stalls a clean
  // in-range workout.
  // Extra sets are an optional stimulus experiment, not a new mandatory
  // baseline. Comparing against configured sets keeps re-evaluation stable
  // when old logs are recomputed without their previous display targets.
  const TARGET_TOLERANCE = 1e-6
  const requiredLoad = ctx.prescribedLoad
  // An earned extra set remains optional. Even if it was prescribed last time,
  // completing the configured baseline is enough for normal progression.
  const requiredSets =
    ctx.prescribedSets != null
      ? Math.max(1, Math.min(ctx.prescribedSets, baseSets))
      : Math.max(1, baseSets)
  const requiredReps = ctx.prescribedReps ?? repLow
  const completedWork =
    bestReps != null &&
    actualSets != null &&
    (isBodyweight || (actualLoad != null && actualLoad > 0))
  const enoughLoad =
    isBodyweight ||
    requiredLoad == null ||
    (actualLoad != null && actualLoad + TARGET_TOLERANCE >= requiredLoad)
  const enoughReps =
    bestReps != null && bestReps + TARGET_TOLERANCE >= requiredReps
  const enoughSets =
    actualSets != null && actualSets + TARGET_TOLERANCE >= requiredSets
  const progressionSignal =
    completedWork && enoughLoad && enoughReps && enoughSets
  const readyToProgress =
    gate !== 'Red' &&
    !perfdown &&
    !nextdayhighsore &&
    !verylowrir &&
    !highpain &&
    progressionSignal

  const establishedLoad =
    isBodyweight || (actualLoad != null && actualLoad > 0)
  const appropriateSetIntensity =
    rirValidated ||
    (actualRir != null && actualRir <= targetRir + 1 && !verylowrir)
  const extrasAllowed =
    riskSignalCount === 0 && !highpain && !rirMissed
  const addSet =
    canVolume &&
    readyToProgress &&
    extrasAllowed &&
    badpump &&
    nextdaylowsore &&
    establishedLoad &&
    appropriateSetIntensity &&
    actualSets != null &&
    actualSets < SET_CAP

  const noData =
    actualLoad == null && bestReps == null && actualSets == null && actualRir == null

  /* --- Decision: FIRST MATCH WINS, in this exact order --- */
  let decision: Decision
  let reason: string
  let bigJump = false // doubled load step on a clearly-too-light session
  const accelerateReps =
    !rirMissed && (score >= 4 || veryeasy)

  if (status === 'Skip') {
    decision = 'Skip'
    reason = 'Marked skip — no change.'
  } else if (severesore) {
    decision = 'Hold/reduce'
    reason =
      week === 1
        ? 'Severe next-day soreness may be novel DOMS in Week 1, but 10/10 is too high to progress through.'
        : 'Severe next-day soreness says the previous muscle dose was not recovered — reduce today.'
  } else if (gate === 'Red') {
    decision = 'Hold/reduce'
    reason = severepain
      ? 'Severe pain is a safety stop — reduce the load and reassess.'
      : 'Multiple recovery risks are present — reduce one stress lever and reassess.'
  } else if (highpain) {
    decision = 'Maintain'
    reason = 'Pain is elevated — hold the target and reassess before adding stress.'
  } else if (week === deloadWeek) {
    decision = 'Deload / maintain'
    reason = 'Deload week — keep loads light and let fatigue drop.'
  } else if (noData) {
    decision = null
    reason = 'Nothing logged yet.'
  } else if (addSet) {
    decision = 'Add 1 set'
    reason =
      'Load, reps, and effort were solid, but pump and next-day soreness were low - add one set.'
  } else if (readyToProgress) {
    if (isBodyweight) {
      // Bodyweight progresses through reps. Sets only increase through the
      // strict stimulus rule above; added load remains the user's choice.
      if (bestReps != null && bestReps + 1 > maxRep) {
        decision = 'Maintain'
        reason =
          'Rep range topped at bodyweight - hold here or add your own load; sets increase only when stimulus feedback supports it.'
      } else if (
        accelerateReps &&
        bestReps != null &&
        bestReps + 2 <= maxRep
      ) {
        decision = 'Add 2 reps'
        reason =
          'Performance and feedback support a faster push — chase two more reps.'
      } else {
        decision = 'Add 1 rep'
        reason = 'Performance supports more work — push for one more rep next session.'
      }
    } else if (progressBias === 'Load +5') {
      decision = 'Add 5 lb'
      bigJump = veryeasy && !rirMissed
      reason = bigJump
        ? 'Push harder next session: take the larger load jump shown.'
        : 'Performance supports more work — add load next session.'
    } else {
      // Both Reps first and Set optional use double progression. Set optional
      // permits the evidence-based set branch above; it does not make volume
      // the default progression on every successful workout.
      if (bestReps != null && bestReps + 1 > maxRep) {
        decision = 'Add 5 lb'
        bigJump = veryeasy && !rirMissed
        reason = bigJump
          ? 'Push harder next session: take the larger load jump after topping the rep range.'
          : 'You topped the rep range — push the load up next session.'
      } else if (
        accelerateReps &&
        bestReps != null &&
        bestReps + 2 <= maxRep
      ) {
        decision = 'Add 2 reps'
        reason =
          'Performance and feedback support a faster push — chase two more reps.'
      } else {
        decision = 'Add 1 rep'
        reason = 'Performance supports more work — push for one more rep next session.'
      }
    }
  } else {
    decision = 'Maintain'
    reason = highpain
      ? 'Pain is elevated — hold the target and reassess before adding stress.'
      : verylowrir
      ? 'That reached near-failure effort — repeat the target before adding more.'
      : nextdayhighsore
        ? 'Next-day soreness was high — repeat the target before adding more.'
      : perfdown
        ? 'Performance dipped — repeat the target and rebuild momentum.'
        : !completedWork
          ? 'Complete the logged load, reps, and sets before increasing the target.'
          : !enoughLoad
            ? 'Complete the prescribed load before increasing the target.'
            : !enoughReps
              ? 'Complete the prescribed reps before increasing the target.'
            : !enoughSets
              ? 'Complete the prescribed sets before increasing the target.'
              : 'Repeat the target and beat it next time.'
  }

  /* --- Step sizes: double the load step on a clearly-too-light session --- */
  const loadStep = bigJump ? loadIncrement * 2 : loadIncrement

  /* --- Display label: show the real numbers the user will act on --- */
  const decisionLabel =
    decision === null
      ? '—'
      : decision === 'Add 5 lb'
        ? `Add ${loadStep} lb`
        : decision

  /* --- Carry-forward next targets (keyed off the canonical decision) --- */
  const reduceSetsForSoreness =
    decision === 'Hold/reduce' && nextdayhighsore && !severepain
  // A skipped deload exposure must preserve the full pre-deload carry. Using
  // the displayed deload prescription here would silently ratchet the next
  // mesocycle down even though no work was performed.
  const restoreDeloadCarry =
    decision === 'Deload / maintain' ||
    (decision === 'Skip' && week === deloadWeek)
  const referenceLoad = actualLoad ?? ctx.prescribedLoad ?? slot.seedLoad
  const referenceSets = actualSets ?? ctx.prescribedSets ?? baseSets
  const referenceReps = bestReps ?? ctx.prescribedReps ?? repLow
  const nextLoad =
    restoreDeloadCarry
      ? (ctx.prevNextLoad ?? referenceLoad)
      : decision === 'Add 5 lb'
      ? (referenceLoad ?? 0) + loadStep
      : decision === 'Hold/reduce'
        ? reduceSetsForSoreness
          ? referenceLoad
          : Math.max(0, (referenceLoad ?? 0) - loadIncrement)
        : referenceLoad

  const nextSets =
    restoreDeloadCarry
      ? (ctx.prevNextSets ??
        (decision === 'Skip' ? referenceSets : baseSets))
      : decision === 'Add 1 set'
      ? baseSets + 1
      : decision === 'Hold/reduce'
        ? reduceSetsForSoreness
          ? Math.max(1, Math.min(baseSets, referenceSets - 1))
          : baseSets
        : decision === 'Skip'
          ? referenceSets
        : decision == null
          ? actualSets
          : baseSets

  const repsInsideConfiguredRange =
    Math.min(repHigh, Math.max(repLow, referenceReps))
  const nextReps =
    restoreDeloadCarry
      ? (ctx.prevNextReps ?? repsInsideConfiguredRange)
      : decision === 'Add 5 lb'
      ? repLow
      : decision === 'Add 2 reps'
        ? (bestReps ?? repLow) + 2
        : decision === 'Add 1 rep'
          ? (bestReps ?? repLow) + 1
          : repsInsideConfiguredRange

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
    veryeasy,
    rirValidated,
    rirMissed,
    badpump,
    goodpump,
    lowsore,
    productivesore,
    incominghighsore,
    incomingseveresore,
    nextdaysoreknown,
    nextdaylowsore,
    nextdayproductivesore,
    nextdayhighsore,
    nextdayseveresore,
    highsore,
    severesore,
    highpain,
    severepain,
    goodrecovery,
    badrecovery,
    perfdown,
    perfup,
    perfok,
    completedWork,
    enoughLoad,
    enoughReps,
    enoughSets,
    establishedLoad,
    appropriateSetIntensity,
    progressionSignal,
    readyToProgress,
    extrasAllowed,
    addSet,
    bigJump,
    accelerateReps,
    reduceSetsForSoreness,
    isBodyweight,
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

/* ------------------------------------------------------------------ */
/* Plateau / stall detection (cross-session)                           */
/* ------------------------------------------------------------------ */

/** One slot's result from a past session, oldest-to-newest. */
export interface StallSample {
  e1rm: number | null
  decision: Decision
}

/**
 * Detect a stall for one exercise across recent sessions: the engine kept
 * saying "Maintain"/"Hold/reduce" AND the estimated 1RM stayed flat. Surfaces
 * the "stalled — consider a swap or early deload" nudge the spreadsheet couldn't.
 *
 *  - window: how many recent sessions must agree (default 3).
 *  - tolerancePct: max e1RM spread (% of the low) still counted as "flat" (default 1.5%).
 */
export function detectStall(
  recent: StallSample[],
  opts: { window?: number; tolerancePct?: number } = {},
): { stalled: boolean; reason: string } {
  const window = opts.window ?? 3
  const tol = opts.tolerancePct ?? 1.5
  const samples = recent.slice(-window)
  if (samples.length < window) return { stalled: false, reason: '' }

  const noProgress = samples.every(
    (s) => s.decision === 'Maintain' || s.decision === 'Hold/reduce',
  )

  const e1rms = samples
    .map((s) => s.e1rm)
    .filter((v): v is number => v != null)

  let flat = false
  if (e1rms.length >= 2) {
    const min = Math.min(...e1rms)
    const max = Math.max(...e1rms)
    flat = min > 0 && ((max - min) / min) * 100 <= tol
  }

  const stalled = noProgress && (e1rms.length < 2 || flat)
  return {
    stalled,
    reason: stalled
      ? `${window} sessions without progress and a flat e1RM — consider swapping the exercise or pulling an early deload.`
      : '',
  }
}
