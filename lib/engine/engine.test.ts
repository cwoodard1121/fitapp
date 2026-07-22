import { describe, it, expect } from 'vitest'
import {
  evaluateSlot,
  targetSets,
  targetLoad,
  epley1RM,
  detectStall,
  DEFAULT_WEIGHTS,
  type SlotConfig,
  type SetLogInput,
  type EngineContext,
} from './engine'

/* ------------------------------------------------------------------ */
/* Builders: minimal slot / log / ctx with per-test overrides.         */
/* Defaults are intentionally "no data" so each test opts in to fields. */
/* ------------------------------------------------------------------ */

function slot(overrides: Partial<SlotConfig> = {}): SlotConfig {
  return {
    progressBias: 'Reps first',
    repLow: 8,
    repHigh: 15,
    targetRir: 3,
    baseSets: 2,
    loadIncrement: 5,
    seedLoad: 75,
    isBodyweight: false,
    ...overrides,
  }
}

function log(overrides: Partial<SetLogInput> = {}): SetLogInput {
  return {
    actualLoad: null,
    bestReps: null,
    actualSets: null,
    actualRir: null,
    hitRirOverride: null,
    pump: null,
    enjoyment: null,
    soreness: null,
    recovery: null,
    performance: null,
    ...overrides,
  }
}

function ctx(overrides: Partial<EngineContext> = {}): EngineContext {
  return { week: 2, deloadWeek: 5, ...overrides }
}

/**
 * A "strong session" log: good recovery, performance up, pump/enjoyment high,
 * soreness in the productive band, RIR on target. Yields score >= 5 without
 * tripping the volume signal (pump and soreness are high, so addSet is false).
 */
function strongLog(overrides: Partial<SetLogInput> = {}): SetLogInput {
  return log({
    actualLoad: 80,
    bestReps: 12,
    actualSets: 2,
    actualRir: 3,
    pump: 8,
    enjoyment: 8,
    soreness: 6,
    recovery: 8,
    performance: 'Up',
    ...overrides,
  })
}

/* ------------------------------------------------------------------ */
/* T1..T10 — core decision contract.                                   */
/* ------------------------------------------------------------------ */

describe('evaluateSlot — pinned decision cases (T1..T10)', () => {
  it('T1: reps-first, room left in range, strong session -> Add 1 rep (nextReps = bestReps + 1)', () => {
    // bestReps (14) is one below repHigh (15): bestReps + 1 = 15 is NOT over the
    // cap, so the engine adds a rep rather than converting to load.
    const s = slot({ progressBias: 'Reps first', repLow: 8, repHigh: 15 })
    const l = strongLog({ bestReps: 14 })
    const res = evaluateSlot(l, s, ctx())

    expect(res.decision).toBe('Add 1 rep')
    expect(res.nextReps).toBe(15)
    expect(res.nextReps).toBe((l.bestReps as number) + 1)
    expect(res.gate).toBe('Green')
    expect(res.score).toBeGreaterThanOrEqual(5)
  })

  it('T2: reps-first, bestReps+1 > repHigh (at cap), green, strong -> Add 5 lb (nextLoad = load + increment)', () => {
    const s = slot({ progressBias: 'Reps first', repLow: 8, repHigh: 15, loadIncrement: 5 })
    const l = strongLog({ actualLoad: 80, bestReps: 15 }) // 15 + 1 = 16 > 15 -> convert to load
    const res = evaluateSlot(l, s, ctx())

    expect(res.decision).toBe('Add 5 lb')
    expect(res.nextLoad).toBe(85)
    expect(res.nextLoad).toBe((l.actualLoad as number) + s.loadIncrement)
  })

  it('T3: Load +5 bias, green, score >= 5 -> Add 5 lb', () => {
    const s = slot({ progressBias: 'Load +5', repLow: 4, repHigh: 6, seedLoad: null })
    const l = strongLog({ actualLoad: 185, bestReps: 5 })
    const res = evaluateSlot(l, s, ctx())

    expect(res.decision).toBe('Add 5 lb')
    expect(res.nextLoad).toBe(190)
  })

  it('T4: bad recovery (gate red) -> Hold/reduce, nextLoad = load - incr, nextSets = sets - 1', () => {
    const s = slot({ progressBias: 'Load +5', loadIncrement: 5, baseSets: 3 })
    const l = log({
      actualLoad: 100,
      bestReps: 5,
      actualSets: 3,
      actualRir: 3,
      recovery: 3, // <= 4 -> badrecovery -> gate Red
    })
    const res = evaluateSlot(l, s, ctx())

    expect(res.gate).toBe('Red')
    expect(res.decision).toBe('Hold/reduce')
    expect(res.nextLoad).toBe(95) // 100 - 5, floored at 0
    expect(res.nextSets).toBe(2) // 3 - 1, floored at 1
  })

  it('T5: non-load bias, good recovery, low pump, sets < 4 -> Add 1 set (nextSets = sets + 1)', () => {
    const s = slot({ progressBias: 'Reps first', baseSets: 3, loadIncrement: 2.5 })
    const l = log({
      actualLoad: 30,
      bestReps: 12,
      actualSets: 3, // < 4
      actualRir: 3,
      pump: 4, // badpump (<= 5)
      soreness: 4, // mild residual soreness is productive, not a volume signal
      recovery: 8, // goodrecovery
      performance: 'Same', // perfok
    })
    const res = evaluateSlot(l, s, ctx())

    expect(res.flags.addSet).toBe(true)
    expect(res.decision).toBe('Add 1 set')
    expect(res.nextSets).toBe(4)
  })

  it('T6: week == deloadWeek -> Deload / maintain; targetLoad = round(prev*0.9), targetSets = round(prev*0.6)', () => {
    const s = slot()
    const res = evaluateSlot(strongLog(), s, ctx({ week: 5, deloadWeek: 5 }))
    expect(res.decision).toBe('Deload / maintain')

    // Target functions on the deload week.
    expect(targetLoad(5, 5, s, 185)).toBe(Math.round(185 * 0.9)) // 166.5 -> 167
    expect(targetSets(5, 5, s, 4)).toBe(Math.max(1, Math.round(4 * 0.6))) // 2.4 -> 2
  })

  it('T7: week 1 -> Calibrate (set baseline); no auto-progression even with great inputs', () => {
    // Inputs that would otherwise be a clean "Add 1 rep" in week 2.
    const s = slot({ progressBias: 'Reps first', repLow: 8, repHigh: 15 })
    const l = strongLog({ bestReps: 12 })
    const res = evaluateSlot(l, s, ctx({ week: 1, deloadWeek: 5 }))

    expect(res.decision).toBe('Calibrate (set baseline)')
    // No progression prescribed: carry-forward targets equal what was logged.
    expect(res.nextLoad).toBe(l.actualLoad)
    expect(res.nextReps).toBe(l.bestReps)
    expect(res.nextSets).toBe(l.actualSets)
  })

  it('T8: hitRirOverride == "Skip" -> Skip', () => {
    // Some data is present so the no-data branch (which precedes Skip) is skipped.
    const l = log({ actualLoad: 100, actualRir: 3, hitRirOverride: 'Skip' })
    const res = evaluateSlot(l, slot(), ctx())

    expect(res.hitRir).toBe('Skip')
    expect(res.decision).toBe('Skip')
  })

  it('T9: no set data (load/reps/sets/rir all null), week 2 -> decision null', () => {
    const res = evaluateSlot(log(), slot(), ctx())

    expect(res.decision).toBeNull()
    expect(res.decisionLabel).toBe('—')
    expect(res.e1rm).toBeNull()
    expect(res.tonnage).toBeNull()
  })

  it('T10: epley1RM(100, 10) === 100 * (1 + 10/30)', () => {
    expect(epley1RM(100, 10)).toBe(100 * (1 + 10 / 30))
    expect(epley1RM(100, 10)).toBeCloseTo(133.333, 3)
  })
})

/* ------------------------------------------------------------------ */
/* Extra sanity tests.                                                 */
/* ------------------------------------------------------------------ */

describe('evaluateSlot — recovery gate', () => {
  it('goes Red from performance Down + not good recovery -> Hold/reduce', () => {
    const l = log({
      actualLoad: 100,
      bestReps: 5,
      actualSets: 3,
      actualRir: 3,
      recovery: 5, // neither good (>=7) nor bad (<=4)
      performance: 'Down', // perfdown && !goodrecovery -> Red
    })
    const res = evaluateSlot(l, slot(), ctx())

    expect(res.flags.perfdown).toBe(true)
    expect(res.flags.goodrecovery).toBe(false)
    expect(res.gate).toBe('Red')
    expect(res.decision).toBe('Hold/reduce')
  })

  it('goes Green on good recovery and Yellow on neutral inputs', () => {
    const base = { actualLoad: 100, bestReps: 5, actualSets: 2, actualRir: 3 }
    expect(evaluateSlot(log({ ...base, recovery: 8 }), slot(), ctx()).gate).toBe('Green')
    expect(evaluateSlot(log({ ...base, recovery: 6 }), slot(), ctx()).gate).toBe('Yellow')
  })
})

describe('evaluateSlot — growth score', () => {
  it('sums the components on a known positive input to 7.5', () => {
    // +2 recovery, +1 perf up, +2 good pump, +1 enjoyment, +1 mild soreness, +0.5 too easy
    const l = log({
      recovery: 8, // +2
      performance: 'Up', // +1
      pump: 8, // +2
      enjoyment: 8, // +1
      soreness: 5, // in [3,6] -> +1
      actualRir: 6, // tooeasy (> targetRir + 2 = 5) -> +1
      actualLoad: 100,
      bestReps: 5,
      actualSets: 2,
    })
    expect(evaluateSlot(l, slot(), ctx()).score).toBe(7.5)
  })

  it('sums the components on a known negative input to -6.5', () => {
    // -3 recovery, -2 perf down, +1 bad pump, 0 enjoyment, -2 high sore (not recovered), -0.5 low rir
    const l = log({
      recovery: 3, // -3
      performance: 'Down', // -2
      pump: 3, // badpump -> +1
      enjoyment: 5, // < 7 -> 0
      soreness: 9, // highsore && !goodrecovery -> -2
      actualRir: 1, // lowrir (< targetRir - 0.5 = 2.5) -> -1
      actualLoad: 100,
      bestReps: 5,
      actualSets: 2,
    })
    expect(evaluateSlot(l, slot(), ctx()).score).toBe(-6.5)
  })
})

describe('evaluateSlot — Hold/reduce flooring', () => {
  it('floors nextLoad at 0 and nextSets at 1', () => {
    const s = slot({ loadIncrement: 5 })
    const l = log({
      actualLoad: 3, // 3 - 5 -> floored to 0
      bestReps: 5,
      actualSets: 1, // 1 - 1 -> floored to 1
      actualRir: 3,
      recovery: 3, // gate Red -> Hold/reduce
    })
    const res = evaluateSlot(l, s, ctx())

    expect(res.decision).toBe('Hold/reduce')
    expect(res.nextLoad).toBe(0)
    expect(res.nextSets).toBe(1)
  })
})

describe('evaluateSlot — decisionLabel', () => {
  it('substitutes the slot increment for "Add 5 lb" (e.g. 2.5)', () => {
    const s = slot({ progressBias: 'Load +5', loadIncrement: 2.5, seedLoad: 30 })
    const l = strongLog({ actualLoad: 30, bestReps: 5 })
    const res = evaluateSlot(l, s, ctx())

    expect(res.decision).toBe('Add 5 lb')
    expect(res.decisionLabel).toBe('Add 2.5 lb')
    expect(res.nextLoad).toBe(32.5)
  })

  it('uses the canonical string for non-load decisions and "—" for null', () => {
    const addRep = evaluateSlot(strongLog({ bestReps: 12 }), slot({ progressBias: 'Reps first' }), ctx())
    expect(addRep.decisionLabel).toBe('Add 1 rep')

    expect(evaluateSlot(log(), slot(), ctx()).decisionLabel).toBe('—')
  })
})

describe('evaluateSlot — e1rm, tonnage, hitRir', () => {
  it('computes e1rm (rounded to 1 dp) and tonnage when data is present', () => {
    const l = log({ actualLoad: 100, bestReps: 10, actualSets: 3, actualRir: 3 })
    const res = evaluateSlot(l, slot(), ctx())

    expect(res.e1rm).toBe(133.3) // round1(100 * (1 + 10/30))
    expect(res.tonnage).toBe(3000) // 3 * 10 * 100
  })

  it('keeps e1rm identical across subjective RIR ratings', () => {
    const objectiveSet = {
      actualLoad: 100,
      bestReps: 10,
      actualSets: 3,
    }
    const noRir = evaluateSlot(
      log({ ...objectiveSet, actualRir: null }),
      slot(),
      ctx(),
    )
    const zeroRir = evaluateSlot(
      log({ ...objectiveSet, actualRir: 0 }),
      slot(),
      ctx(),
    )
    const highRir = evaluateSlot(
      log({ ...objectiveSet, actualRir: 10 }),
      slot(),
      ctx(),
    )

    expect(noRir.e1rm).toBe(133.3)
    expect(zeroRir.e1rm).toBe(noRir.e1rm)
    expect(highRir.e1rm).toBe(noRir.e1rm)
  })

  it('returns null e1rm/tonnage when reps are missing', () => {
    const l = log({ actualLoad: 100, bestReps: null, actualSets: 3 })
    const res = evaluateSlot(l, slot(), ctx())

    expect(res.e1rm).toBeNull()
    expect(res.tonnage).toBeNull()
  })

  it('derives hit_rir_auto and lets the override win', () => {
    const s = slot({ targetRir: 3 }) // band: too hard < 2.5, ok 2.5..5, too easy > 5
    const base = { actualLoad: 100 } // some data so we are not in the no-data branch

    expect(evaluateSlot(log({ ...base, actualRir: 2 }), s, ctx()).hitRir).toBe('N - too hard')
    expect(evaluateSlot(log({ ...base, actualRir: 6 }), s, ctx()).hitRir).toBe('N - too easy')
    expect(evaluateSlot(log({ ...base, actualRir: 3 }), s, ctx()).hitRir).toBe('Y')
    expect(evaluateSlot(log({ ...base, actualRir: null }), s, ctx()).hitRir).toBeNull()
    // Override wins over the auto read.
    expect(evaluateSlot(log({ ...base, actualRir: 2, hitRirOverride: 'Y' }), s, ctx()).hitRir).toBe('Y')
  })
})

describe('targetSets / targetLoad — per-week derivation', () => {
  it('week 1 returns base sets and seed load (0 when unseeded)', () => {
    const s = slot({ baseSets: 4, seedLoad: 30 })
    expect(targetSets(1, 5, s, 99)).toBe(4)
    expect(targetLoad(1, 5, s, 99)).toBe(30)
    expect(targetLoad(1, 5, slot({ seedLoad: null }), 99)).toBe(0)
  })

  it('non-deload weeks carry the previous targets forward, falling back to base/seed', () => {
    const s = slot({ baseSets: 2, seedLoad: 75 })
    expect(targetSets(2, 5, s, 4)).toBe(4)
    expect(targetSets(2, 5, s, null)).toBe(2)
    expect(targetLoad(2, 5, s, 200)).toBe(200)
    expect(targetLoad(2, 5, s, null)).toBe(75)
  })

  it('deload week scales sets to 60% and load to 90%', () => {
    const s = slot()
    expect(targetSets(5, 5, s, 5)).toBe(3) // round(3.0)
    expect(targetLoad(5, 5, s, 200)).toBe(180) // round(180.0)
  })
})

/* ------------------------------------------------------------------ */
/* Smart autoregulation layer — the upgrades on top of the port.       */
/* ------------------------------------------------------------------ */

describe('smart layer — detrained ramp (don\'t stall a clean green session)', () => {
  it('progresses on a green session scoring 4 (would Maintain under the old >=5 gate)', () => {
    // recovery +2, perf up +1, enjoyment +1 = score 4; pump/soreness null so no
    // volume signal; RIR on target. Old engine needed >=5 here -> Maintain.
    const s = slot({ progressBias: 'Reps first', repLow: 8, repHigh: 15 })
    const l = log({
      actualLoad: 80,
      bestReps: 10,
      actualSets: 2,
      actualRir: 3,
      recovery: 8,
      performance: 'Up',
      enjoyment: 7,
    })
    const res = evaluateSlot(l, s, ctx())
    expect(res.score).toBe(4)
    expect(res.gate).toBe('Green')
    expect(res.decision).toBe('Add 1 rep')
    expect(res.nextReps).toBe(11)
  })
})

describe('smart layer — bigger jumps when the bar is clearly too light', () => {
  it('doubles the load step on a very-easy Load +5 session (veryeasy: RIR >= target+3)', () => {
    const s = slot({ progressBias: 'Load +5', loadIncrement: 5, repLow: 5, repHigh: 5, seedLoad: 135 })
    const l = strongLog({ actualLoad: 135, bestReps: 5, actualRir: 6 }) // target 3 -> +3 over = veryeasy
    const res = evaluateSlot(l, s, ctx())
    expect(res.flags.veryeasy).toBe(true)
    expect(res.flags.bigJump).toBe(true)
    expect(res.decision).toBe('Add 5 lb')
    expect(res.decisionLabel).toBe('Add 10 lb') // doubled step
    expect(res.nextLoad).toBe(145) // 135 + 2*5
  })

  it('adds two reps when very easy and well below the rep cap', () => {
    const s = slot({ progressBias: 'Reps first', repLow: 8, repHigh: 15 })
    const l = strongLog({ bestReps: 10, actualRir: 6 }) // veryeasy, 10+2 <= 15
    const res = evaluateSlot(l, s, ctx())
    expect(res.decision).toBe('Add 2 reps')
    expect(res.nextReps).toBe(12)
  })

  it('keeps the single step on an on-target session (RIR == target, not veryeasy)', () => {
    const s = slot({ progressBias: 'Load +5', loadIncrement: 5, seedLoad: 135 })
    const res = evaluateSlot(strongLog({ actualLoad: 135, bestReps: 5, actualRir: 3 }), s, ctx())
    expect(res.flags.bigJump).toBe(false)
    expect(res.nextLoad).toBe(140)
  })
})

describe('smart layer — low pump earns a set (stimulus over load)', () => {
  it('adds a set on a low-pump day even when recovery is only yellow', () => {
    // Yellow gate (recovery 6), low pump, room under the set cap, perf ok.
    const s = slot({ progressBias: 'Reps first', baseSets: 2 })
    const l = log({
      actualLoad: 40,
      bestReps: 12,
      actualSets: 2,
      actualRir: 3,
      pump: 4, // badpump
      recovery: 6, // yellow, not green
      performance: 'Same',
    })
    const res = evaluateSlot(l, s, ctx())
    expect(res.gate).toBe('Yellow')
    expect(res.flags.addSet).toBe(true)
    expect(res.decision).toBe('Add 1 set')
    expect(res.nextSets).toBe(3)
  })

  it('does NOT pile sets on a heavy compound (Load +5) from low pump', () => {
    const s = slot({ progressBias: 'Load +5', baseSets: 3 })
    const l = log({
      actualLoad: 225,
      bestReps: 5,
      actualSets: 3,
      actualRir: 3,
      pump: 4, // badpump
      recovery: 6,
      performance: 'Same',
    })
    const res = evaluateSlot(l, s, ctx())
    expect(res.flags.addSet).toBe(false)
    expect(res.decision).not.toBe('Add 1 set')
  })

  it('ramps volume up to 5 sets, then stops adding', () => {
    const s = slot({ progressBias: 'Reps first', baseSets: 2 })
    const base = {
      actualLoad: 40,
      bestReps: 12,
      actualRir: 3,
      pump: 4,
      recovery: 8,
      performance: 'Same' as const,
    }
    expect(evaluateSlot(log({ ...base, actualSets: 4 }), s, ctx()).decision).toBe('Add 1 set')
    expect(evaluateSlot(log({ ...base, actualSets: 5 }), s, ctx()).flags.addSet).toBe(false)
  })
})

describe('smart layer — incoming soreness and DOMS', () => {
  it('does not add volume merely because incoming soreness is low', () => {
    const res = evaluateSlot(
      log({
        actualLoad: 40,
        bestReps: 12,
        actualSets: 2,
        actualRir: 3,
        pump: 7,
        soreness: 1,
        recovery: 8,
        performance: 'Same',
      }),
      slot(),
      ctx(),
    )

    expect(res.flags.lowsore).toBe(true)
    expect(res.flags.addSet).toBe(false)
    expect(res.decision).not.toBe('Add 1 set')
  })

  it('treats mild soreness plus strong performance as compatible with progression', () => {
    const res = evaluateSlot(strongLog({ soreness: 5 }), slot(), ctx())
    expect(res.gate).toBe('Green')
    expect(res.decision).toBe('Add 1 rep')
  })

  it('holds the next session after 10/10 soreness', () => {
    const result = evaluateSlot(strongLog({ soreness: 10 }), slot(), ctx({ week: 1 }))
    expect(result.gate).toBe('Red')
    expect(result.decision).toBe('Hold/reduce')
  })
})

describe('smart layer — configurable readiness weights', () => {
  it('omitting weights matches the exported defaults', () => {
    const l = log({ recovery: 8, performance: 'Up', pump: 8, enjoyment: 8, soreness: 5, actualRir: 6, actualLoad: 100, bestReps: 5, actualSets: 2 })
    const base = evaluateSlot(l, slot(), ctx()).score
    const withDefaults = evaluateSlot(l, slot(), ctx({ weights: DEFAULT_WEIGHTS })).score
    expect(withDefaults).toBe(base)
    expect(withDefaults).toBe(7.5)
  })

  it('respects a tuned weight (e.g. recovery matters more)', () => {
    const l = log({ recovery: 8, actualLoad: 100, bestReps: 5, actualSets: 2, actualRir: 3 })
    const tuned = { ...DEFAULT_WEIGHTS, recoveryGood: 5 }
    expect(evaluateSlot(l, slot(), ctx({ weights: tuned })).score).toBe(5)
    expect(evaluateSlot(l, slot(), ctx()).score).toBe(2)
  })
})

describe('progression balance — performance leads and RIR stays secondary', () => {
  it('progresses after better performance without requiring green recovery', () => {
    const res = evaluateSlot(
      log({
        actualLoad: 80,
        bestReps: 10,
        actualSets: 2,
        actualRir: 3,
        performance: 'Up',
      }),
      slot(),
      ctx(),
    )

    expect(res.gate).toBe('Yellow')
    expect(res.flags.readyToProgress).toBe(true)
    expect(res.decision).toBe('Add 1 rep')
    expect(res.reason).toMatch(/push|more work/i)
  })

  it('does not let a slightly low RIR veto strong recovery and performance', () => {
    const res = evaluateSlot(
      log({
        actualLoad: 80,
        bestReps: 10,
        actualSets: 2,
        actualRir: 2,
        recovery: 8,
        performance: 'Up',
      }),
      slot({ targetRir: 3 }),
      ctx(),
    )

    expect(res.flags.lowrir).toBe(true)
    expect(res.flags.verylowrir).toBe(false)
    expect(res.score).toBe(2.5)
    expect(res.decision).toBe('Add 1 rep')
  })

  it('still holds after a genuinely near-failure effort', () => {
    const res = evaluateSlot(
      log({
        actualLoad: 80,
        bestReps: 10,
        actualSets: 2,
        actualRir: 0,
        recovery: 8,
        performance: 'Up',
        pump: 8,
      }),
      slot({ targetRir: 3 }),
      ctx(),
    )

    expect(res.flags.verylowrir).toBe(true)
    expect(res.flags.readyToProgress).toBe(false)
    expect(res.decision).toBe('Maintain')
  })

  it('adds a set for Set optional when the configured score supports progression', () => {
    const res = evaluateSlot(
      log({
        actualLoad: 40,
        bestReps: 12,
        actualSets: 2,
        actualRir: 3,
        pump: 8,
        enjoyment: 8,
        performance: 'Same',
      }),
      slot({ progressBias: 'Set optional' }),
      ctx(),
    )

    expect(res.score).toBe(3)
    expect(res.decision).toBe('Add 1 set')
    expect(res.nextSets).toBe(3)
  })
})

describe('bodyweight — reps/sets only, never an automatic load bump', () => {
  it('adds a rep inside the range like any reps-first lift', () => {
    const s = slot({ isBodyweight: true, progressBias: 'Reps first', repLow: 6, repHigh: 10 })
    const res = evaluateSlot(strongLog({ actualLoad: 0, bestReps: 8 }), s, ctx())
    expect(res.decision).toBe('Add 1 rep')
    expect(res.nextReps).toBe(9)
  })

  it('at the rep cap, adds a SET instead of converting to load (room under cap)', () => {
    const s = slot({ isBodyweight: true, progressBias: 'Reps first', repLow: 6, repHigh: 10 })
    // bestReps 10, +1 = 11 > cap; a loaded reps-first lift would "Add 5 lb".
    const res = evaluateSlot(strongLog({ actualLoad: 0, bestReps: 10, actualSets: 2 }), s, ctx())
    expect(res.decision).toBe('Add 1 set')
    expect(res.nextSets).toBe(3)
    expect(res.nextLoad).toBe(0) // never auto-loaded
  })

  it('at rep cap AND set cap, holds (user can add their own weight)', () => {
    const s = slot({ isBodyweight: true, progressBias: 'Reps first', repLow: 6, repHigh: 10 })
    const res = evaluateSlot(strongLog({ actualLoad: 0, bestReps: 10, actualSets: 5 }), s, ctx())
    expect(res.decision).toBe('Maintain')
  })

  it('never returns "Add 5 lb" even with a Load +5 bias + very easy session', () => {
    const s = slot({ isBodyweight: true, progressBias: 'Load +5', repLow: 5, repHigh: 8, seedLoad: null })
    const res = evaluateSlot(strongLog({ actualLoad: 0, bestReps: 6, actualRir: 6 }), s, ctx())
    expect(res.decision).not.toBe('Add 5 lb')
    expect(res.nextLoad).toBe(0)
  })

  it('respects the user-entered added load (carries it forward unchanged)', () => {
    const s = slot({ isBodyweight: true, progressBias: 'Reps first', repLow: 6, repHigh: 10 })
    // User strapped on 25 lb; strong session inside range -> add a rep, keep the 25.
    const res = evaluateSlot(strongLog({ actualLoad: 25, bestReps: 8 }), s, ctx())
    expect(res.decision).toBe('Add 1 rep')
    expect(res.nextLoad).toBe(25)
  })
})

describe('detectStall — plateau detection', () => {
  it('flags a stall after 3 flat, no-progress sessions', () => {
    const r = detectStall([
      { e1rm: 200, decision: 'Maintain' },
      { e1rm: 201, decision: 'Maintain' },
      { e1rm: 200, decision: 'Hold/reduce' },
    ])
    expect(r.stalled).toBe(true)
    expect(r.reason).toMatch(/swap|deload/i)
  })

  it('does not flag when e1RM is climbing', () => {
    const r = detectStall([
      { e1rm: 200, decision: 'Add 1 rep' },
      { e1rm: 210, decision: 'Add 5 lb' },
      { e1rm: 220, decision: 'Add 5 lb' },
    ])
    expect(r.stalled).toBe(false)
  })

  it('needs a full window before deciding', () => {
    expect(detectStall([{ e1rm: 200, decision: 'Maintain' }]).stalled).toBe(false)
  })
})
