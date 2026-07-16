/**
 * simplegym autoregulation engine — the heart of the app.
 *
 * Pure and side-effect free: no imports, no I/O, no globals. Every output is a
 * deterministic function of its inputs so it can run identically on the server
 * (data layer) and the client (UI explanations) and be unit-tested in isolation.
 *
 * Two layers:
 *  1. The faithful spreadsheet port — derived flags, growth score, recovery
 *     gate, volume signal, and the first-match-wins decision ladder. Pinned by
 *     the §10 acceptance tests; do not drift from these.
 *  2. A "smart" autoregulation layer on top, tuned for a returning/detrained
 *     lifter (see the SMART AUTOREGULATION LAYER block): faster ramp when
 *     readiness is clearly green, a doubled load step when the bar is far too
 *     light, an "Add 2 reps" jump, and a stimulus rule — a low pump earns a set
 *     even when load/rep progression is blocked. These only change behaviour
 *     outside the pinned cases, so the acceptance tests stay green.
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
 * Readiness-score weights. Defaults reproduce the spreadsheet exactly; the
 * Settings screen can tune them. Pass via EngineContext.weights to override.
 */
export interface ReadinessWeights {
  recoveryGood: number
  recoveryBad: number
  perfUp: number
  perfDown: number
  pumpGood: number
  pumpBad: number
  enjoyment: number
  sorenessBand: number
  sorenessHighNoRecovery: number
  rirTooEasy: number
  rirLow: number
}

export const DEFAULT_WEIGHTS: ReadinessWeights = {
  recoveryGood: 2,
  recoveryBad: -3,
  perfUp: 1,
  perfDown: -2,
  pumpGood: 2,
  pumpBad: 1,
  enjoyment: 1,
  sorenessBand: 1,
  sorenessHighNoRecovery: -2,
  rirTooEasy: 1,
  rirLow: -1,
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
  recovery: number | null
  performance: Performance | null
}

export interface EngineContext {
  week: number
  deloadWeek: number
  prevNextLoad?: number | null
  prevNextSets?: number | null
  prevNextReps?: number | null
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

export interface PlannedTargets {
  load: number | null
  sets: number | null
  reps: number | null
  rir: number | null
}

export interface ReadinessPlan {
  targets: PlannedTargets
  note: string | null
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

/**
 * Apply incoming soreness to today's prescription before sets are performed.
 * Mild residual soreness is normal; high soreness prevents another progression,
 * while 10/10 trims the dose. Week 1 calls out novel DOMS instead of pretending
 * it proves the whole program is over-dosed.
 */
export function adjustTargetsForReadiness(
  targets: PlannedTargets,
  log: SetLogInput,
  slot: SlotConfig,
  ctx: Pick<EngineContext, 'week'>,
  previous: SetLogInput | null,
): ReadinessPlan {
  const soreness = log.soreness
  if (soreness == null || soreness < 8) return { targets, note: null }

  const severe = soreness >= 10
  const performingStrong = log.recovery != null && log.recovery >= 7 && log.performance === 'Up'
  const priorSets = previous?.actualSets ?? targets.sets ?? slot.baseSets
  const setCap = severe ? Math.max(1, priorSets - 1) : priorSets
  const priorLoad = previous?.actualLoad
  const priorReps = previous?.bestReps

  let load = priorLoad == null ? targets.load : Math.min(targets.load ?? priorLoad, priorLoad)
  if (severe && !performingStrong && !slot.isBodyweight && load != null) {
    load = Math.max(0, load - slot.loadIncrement)
  }

  const adjusted: PlannedTargets = {
    ...targets,
    load,
    sets: targets.sets == null ? setCap : Math.min(targets.sets, setCap),
    reps: priorReps == null ? targets.reps : Math.min(targets.reps ?? priorReps, priorReps),
  }

  if (severe) {
    return {
      targets: adjusted,
      note:
        ctx.week === 1
          ? '10/10 soreness may be novel first-week DOMS, but it is still too high to push through. Trim today by a set and reassess after performance.'
          : '10/10 soreness signals unresolved fatigue from the last muscle exposure. Trim today by a set and avoid progressing the load.',
    }
  }

  return {
    targets: adjusted,
    note: performingStrong
      ? 'You are performing strongly despite high soreness. Repeat the last dose today, but do not add load, reps, or sets yet.'
      : 'High incoming soreness means the last muscle exposure may not be recovered. Repeat at most the last dose and let performance decide.',
  }
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
  const { progressBias, repLow, repHigh, targetRir, baseSets, loadIncrement, isBodyweight } =
    slot
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
  const lowsore = soreness != null && soreness <= 2
  const productivesore = soreness != null && soreness >= 3 && soreness <= 6
  const highsore = soreness != null && soreness >= 8
  const severesore = soreness != null && soreness >= 10
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
    (productivesore
      ? w.sorenessBand
      : highsore && !goodrecovery
        ? w.sorenessHighNoRecovery
        : 0) +
    (tooeasy ? w.rirTooEasy : lowrir ? w.rirLow : 0)

  /* --- Recovery gate --- */
  const gate: Gate =
    badrecovery ||
    (perfdown && !goodrecovery) ||
    severesore ||
    (highsore && (!goodrecovery || perfdown)) ||
    (verylowrir && !goodrecovery && (perfdown || highsore))
      ? 'Red'
      : goodrecovery && !highsore
        ? 'Green'
        : 'Yellow'

  /* === SMART AUTOREGULATION LAYER ===================================
   * Tuned for a returning / detrained lifter: bank easy progress fast,
   * and treat a low pump as an under-stimulus signal that earns volume
   * even when load/rep progression is blocked. The §10 acceptance cases
   * are unaffected — they all sit on-target (RIR == target, high pump),
   * outside these smart thresholds. */
  const SET_CAP = 5 // willing to ramp hypertrophy work up to 5 work sets
  const PROGRESS_SCORE = 4 // was 5: a clean green session shouldn't stall

  // Clearly more in the tank than the +2 "too easy" -> the load is too light.
  const veryeasy = actualRir != null && actualRir >= targetRir + 3
  // Volume is for hypertrophy work, not heavy compounds (Load +5). Bodyweight
  // movements always allow volume — sets are how they progress once reps cap.
  const canVolume = progressBias !== 'Load +5' || isBodyweight

  // Stimulus-driven volume signal: a low pump means the
  // muscle was under-stimulated, so it earns a SET — and this is checked
  // BEFORE load/rep progression, so "can't add load/reps cleanly but pump is
  // low -> add a set" falls out naturally. Relaxed from the original (good
  // recovery -> any non-red gate) so a low pump still earns a set on a
  // merely-okay day. Heavy compounds (Load +5) are excluded — pump isn't their
  // signal and extra sets there just pile on fatigue.
  const addSet =
    canVolume &&
    gate !== 'Red' &&
    perfok &&
    badpump &&
    (actualSets == null || actualSets < SET_CAP)

  const noData =
    actualLoad == null && bestReps == null && actualSets == null && actualRir == null

  /* --- Decision: FIRST MATCH WINS, in this exact order --- */
  let decision: Decision
  let reason: string
  let bigJump = false // doubled load step on a clearly-too-light session

  if (week === deloadWeek) {
    decision = 'Deload / maintain'
    reason = 'Deload week — keep loads light and let fatigue drop.'
  } else if (status === 'Skip') {
    decision = 'Skip'
    reason = 'Marked skip — no change.'
  } else if (noData) {
    decision = null
    reason = severesore
      ? 'Severe incoming soreness — use the reduced target and reassess after your first work set.'
      : 'Nothing logged yet.'
  } else if (severesore) {
    decision = 'Hold/reduce'
    reason =
      week === 1
        ? 'Severe soreness may be novel DOMS in Week 1, but 10/10 is too high to progress through.'
        : 'Severe soreness says the previous muscle dose was not recovered — reduce today.'
  } else if (week === 1) {
    decision = 'Calibrate (set baseline)'
    reason = highsore
      ? 'Week 1 DOMS is common. Hold the dose steady, log honest performance, and do not add work yet.'
      : 'Week 1 — log honest numbers to set your baseline; no push yet.'
  } else if (gate === 'Red') {
    decision = 'Hold/reduce'
    reason = badrecovery
      ? 'Recovery is poor — hold or drop a touch and rebuild.'
      : "Readiness is red — hold or reduce, don't add stress."
  } else if (addSet) {
    decision = 'Add 1 set'
    reason = 'Low pump with recovery to spare — under-stimulated, so add a set (volume, not load).'
  } else if (perfok && goodrecovery && !lowrir && (score >= PROGRESS_SCORE || tooeasy)) {
    if (isBodyweight) {
      // Bodyweight: reps then sets only — never an automatic load bump.
      if (bestReps != null && bestReps + 1 > maxRep) {
        if (actualSets == null || actualSets < SET_CAP) {
          decision = 'Add 1 set'
          reason =
            'Topped the rep range on a bodyweight move — add a set for volume (or strap on some weight yourself).'
        } else {
          decision = 'Maintain'
          reason =
            'Maxed reps and sets at bodyweight — hold here, or add your own load to keep progressing.'
        }
      } else if (veryeasy && bestReps != null && bestReps + 2 <= maxRep) {
        decision = 'Add 2 reps'
        reason = 'Lots left in the tank — chase two reps this time, not one.'
      } else {
        decision = 'Add 1 rep'
        reason = 'Strong bodyweight set inside the range — add a rep.'
      }
    } else if (progressBias === 'Load +5') {
      decision = 'Add 5 lb'
      bigJump = veryeasy
      reason = veryeasy
        ? 'Way more in the tank — jump the load up harder this time.'
        : 'Strong session, recovery green — add load.'
    } else if (progressBias === 'Reps first') {
      if (bestReps != null && bestReps + 1 > maxRep) {
        decision = 'Add 5 lb'
        bigJump = veryeasy
        reason = veryeasy
          ? 'Topped the rep range with plenty left — bump the load up a chunk.'
          : 'Hit the top of the rep range — convert the progress to load.'
      } else if (veryeasy && bestReps != null && bestReps + 2 <= maxRep) {
        decision = 'Add 2 reps'
        reason = 'Lots left in the tank — chase two reps this time, not one.'
      } else {
        decision = 'Add 1 rep'
        reason = 'Strong session inside the range — add a rep.'
      }
    } else if (progressBias === 'Set optional') {
      decision = 'Add 1 set'
      reason = 'Strong session — add a set to drive more volume.'
    } else {
      decision = 'Maintain'
      reason = 'On track — repeat and beat it next time.'
    }
  } else if (tooeasy && perfok && !highsore && progressBias === 'Load +5' && !isBodyweight) {
    decision = 'Add 5 lb'
    bigJump = veryeasy
    reason = veryeasy ? 'Too light — jump the load up harder.' : 'That was too light — add load.'
  } else {
    decision = 'Maintain'
    reason = lowrir
      ? 'That was a grind — repeat it and clean up the reps before adding.'
      : 'Hold steady — repeat and progress next time.'
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
  const nextLoad =
    decision === 'Add 5 lb'
      ? (actualLoad ?? 0) + loadStep
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
    decision === 'Add 2 reps'
      ? (bestReps ?? repLow) + 2
      : decision === 'Add 1 rep'
        ? (bestReps ?? repLow) + 1
        : bestReps

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
    badpump,
    goodpump,
    lowsore,
    productivesore,
    highsore,
    severesore,
    goodrecovery,
    badrecovery,
    perfdown,
    perfup,
    perfok,
    addSet,
    bigJump,
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
