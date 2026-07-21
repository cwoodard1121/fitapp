import { describe, expect, it } from "vitest"

import type {
  Block,
  BodyMetric,
  ExerciseSlot,
  NutritionLog,
  RecoveryMetric,
  Session,
  SetEntry,
  SetLog,
} from "@/lib/types"
import { computeBlockStats } from "./stats"

const block: Block = {
  id: "block",
  user_id: "user",
  kind: "training",
  name: "Strength block",
  goal: null,
  phase: "strength",
  start_date: "2026-07-01",
  end_date: null,
  length_weeks: 4,
  program_id: "program-a",
  calorie_target: 2000,
  protein_target: 140,
  carb_target: null,
  fat_target: null,
  is_active: true,
  notes: null,
  created_at: "2026-07-01T00:00:00.000Z",
}

function session(
  id: string,
  date: string,
  programId = "program-a",
  status: Session["status"] = "done",
): Session {
  return {
    id,
    user_id: "user",
    program_id: programId,
    day_id: "day",
    week: 1,
    performed_at: status === "done" ? `${date}T12:00:00.000Z` : null,
    status,
    created_at: `${date}T12:00:00.000Z`,
  }
}

function setLog(
  id: string,
  sessionId: string,
  slotId: string,
  values: Partial<SetLog> = {},
): SetLog {
  return {
    id,
    user_id: "user",
    session_id: sessionId,
    slot_id: slotId,
    week: 1,
    actual_load: null,
    best_reps: null,
    actual_sets: null,
    actual_rir: null,
    hit_rir_override: null,
    pump: null,
    enjoyment: null,
    soreness: null,
    recovery: null,
    performance: null,
    notes: null,
    created_at: "2026-07-01T12:00:00.000Z",
    ...values,
  }
}

function entry(
  id: string,
  sessionId: string,
  setNumber: number,
  load: number,
  reps: number,
  rir: number,
): SetEntry {
  return {
    id,
    user_id: "user",
    session_id: sessionId,
    slot_id: "row",
    set_number: setNumber,
    load,
    reps,
    rir,
    created_at: "2026-07-03T12:00:00.000Z",
  }
}

function nutrition(
  date: string,
  calories: number,
  protein: number | null,
): NutritionLog {
  return {
    id: date,
    user_id: "user",
    logged_on: date,
    calories,
    protein,
    carbs: 200,
    fat: 60,
    notes: null,
    source: "manual",
    created_at: `${date}T12:00:00.000Z`,
  }
}

function body(
  date: string,
  weight: number,
  bodyfatPct: number,
): BodyMetric {
  return {
    id: date,
    user_id: "user",
    measured_on: date,
    bodyweight: weight,
    bodyfat_pct: bodyfatPct,
    bia_bodyfat_pct: bodyfatPct,
    height_cm: null,
    neck_cm: null,
    waist_cm: null,
    navy_bodyfat_pct: null,
    notes: null,
    source: "manual",
    created_at: `${date}T12:00:00.000Z`,
  }
}

function recovery(date: string, steps: number): RecoveryMetric {
  return {
    id: `recovery-${date}`,
    user_id: "user",
    metric_date: date,
    steps,
    sleep_minutes_asleep: null,
    sleep_minutes_in_period: null,
    sleep_light_min: null,
    sleep_deep_min: null,
    sleep_rem_min: null,
    sleep_awake_min: null,
    resting_hr: null,
    hrv_ms: null,
    source: "wearable",
    synced_at: `${date}T12:00:00.000Z`,
  }
}

const slots: ExerciseSlot[] = [
  {
    id: "bench",
    day_id: "day",
    user_id: "user",
    slot_code: "A",
    order_index: 0,
    exercise_name: "Bench press",
    muscle_area: "Chest",
    progress_bias: "Load +5",
    rep_low: 5,
    rep_high: 8,
    target_rir: 2,
    base_sets: 3,
    load_increment: 5,
    seed_load: 100,
    is_bodyweight: false,
  },
  {
    id: "row",
    day_id: "day",
    user_id: "user",
    slot_code: "B",
    order_index: 1,
    exercise_name: "Barbell row",
    muscle_area: "Back",
    progress_bias: "Reps first",
    rep_low: 6,
    rep_high: 10,
    target_rir: 2,
    base_sets: 2,
    load_increment: 5,
    seed_load: 100,
    is_bodyweight: false,
  },
]

describe("computeBlockStats", () => {
  it("summarizes training, nutrition, and body data inside the block window", () => {
    const stats = computeBlockStats({
      block,
      today: "2026-07-21",
      sessions: [
        session("s1", "2026-07-01"),
        session("s2", "2026-07-03"),
        session("s3", "2026-07-09"),
        session("planned", "2026-07-10", "program-a", "planned"),
        session("other-program", "2026-07-11", "program-b"),
        session("before", "2026-06-30"),
      ],
      setLogs: [
        setLog("l1", "s1", "bench", {
          actual_load: 100,
          best_reps: 5,
          actual_sets: 3,
          actual_rir: 2,
        }),
        setLog("l2", "s2", "row", {
          actual_load: 100,
          best_reps: 8,
          actual_sets: 2,
          actual_rir: 2,
        }),
      ],
      setEntries: [
        entry("e1", "s2", 1, 100, 8, 2),
        entry("e2", "s2", 2, 100, 6, 1),
      ],
      slots,
      recoveryMetrics: [
        recovery("2026-07-01", 8000),
        recovery("2026-07-02", 10_000),
        recovery("2026-07-04", 12_000),
        recovery("2026-07-21", 100),
        recovery("2026-06-30", 20_000),
      ],
      stepBaseline: 10_000,
      nutritionLogs: [
        nutrition("2026-07-01", 2000, 150),
        nutrition("2026-07-02", 2300, 130),
        nutrition("2026-07-05", 1800, null),
        nutrition("2026-06-30", 1000, 50),
      ],
      bodyMetrics: [
        body("2026-07-01", 200, 20),
        body("2026-07-15", 196, 19),
      ],
    })

    expect(stats).toMatchObject({
      status: "observed",
      observedDays: 21,
      observedWeeks: 3,
      dataDays: 7,
      training: {
        sessions: 3,
        trainingDays: 3,
        avgTrainingDaysPerWeek: 1,
        exerciseCount: 2,
        workingSets: 5,
        totalReps: 29,
        totalVolume: 2900,
      },
      nutrition: {
        daysLogged: 3,
        longestLoggingStreak: 2,
        proteinTargetHitPct: 50,
      },
      activity: {
        stepBaseline: 10_000,
        daysLogged: 3,
        avgSteps: 10_000,
        totalSteps: 30_000,
        minSteps: 8000,
        maxSteps: 12_000,
      },
      body: {
        checkIns: 2,
        startWeight: 200,
        endWeight: 196,
        weightChange: -4,
        weightRatePerWeek: -2,
        bodyfatChange: -1,
      },
    })
    expect(stats.training.avgRir).toBeCloseTo(1.8)
    expect(stats.nutrition.coveragePct).toBeCloseTo((3 / 21) * 100)
    expect(stats.nutrition.avgCalories).toBeCloseTo(2033.333)
    expect(stats.nutrition.avgProtein).toBe(140)
    expect(stats.nutrition.calorieTargetHitPct).toBeCloseTo(66.667)
    expect(stats.activity.coveragePct).toBeCloseTo((3 / 21) * 100)
    expect(stats.activity.avgStepsVsBaseline).toBe(0)
    expect(stats.activity.baselineHitPct).toBeCloseTo(66.667)
  })

  it("includes every program for a diet block", () => {
    const stats = computeBlockStats({
      block: { ...block, kind: "diet" },
      today: "2026-07-21",
      sessions: [
        session("a", "2026-07-02", "program-a"),
        session("b", "2026-07-03", "program-b"),
      ],
      setLogs: [],
      setEntries: [],
      slots: [],
      recoveryMetrics: [],
      stepBaseline: 10_000,
      nutritionLogs: [],
      bodyMetrics: [],
    })

    expect(stats.training.sessions).toBe(2)
  })

  it("returns an empty scope for upcoming and undated blocks", () => {
    const common = {
      today: "2026-07-21",
      sessions: [],
      setLogs: [],
      setEntries: [],
      slots: [],
      recoveryMetrics: [],
      stepBaseline: 10_000,
      nutritionLogs: [],
      bodyMetrics: [],
    }

    expect(
      computeBlockStats({
        ...common,
        block: { ...block, start_date: "2026-08-01" },
      }).status,
    ).toBe("upcoming")
    expect(
      computeBlockStats({
        ...common,
        block: { ...block, start_date: null },
      }).status,
    ).toBe("undated")
  })
})
