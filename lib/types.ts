/**
 * Shared application types.
 *
 * - DB row interfaces mirror the Postgres/Supabase schema EXACTLY (snake_case
 *   column names are LAW — feature code reads/writes these). Nullable columns
 *   are typed `| null`; `date`/`timestamptz` are ISO strings as returned by
 *   supabase-js.
 * - Engine enum types are re-exported from the engine module so there is a
 *   single source of truth (the engine owns them; the data layer maps DB rows
 *   to engine inputs).
 */

import type {
  ProgressBias,
  Performance,
  RirOverride,
  ReadinessWeights,
} from "@/lib/engine/engine";

// Re-export the engine's canonical enum/result types for consumers that only
// want to import from "@/lib/types".
export type {
  ProgressBias,
  Performance,
  RirOverride,
  Gate,
  Decision,
  EngineResult,
  ReadinessWeights,
} from "@/lib/engine/engine";

/* ------------------------------------------------------------------ */
/* DB enum unions (string columns with a fixed set of values)          */
/* ------------------------------------------------------------------ */

export type Unit = "lb" | "kg";

export type SessionStatus = "planned" | "in_progress" | "done" | "skipped";

export type BlockKind = "training" | "diet";
export type TrainingPhase = "hypertrophy" | "strength" | "peak" | "maintain";
export type DietPhase = "cut" | "bulk" | "recomp" | "maintain";
export type BlockPhase = TrainingPhase | DietPhase;

export type GoalMetricType =
  | "bodyweight"
  | "bodyfat"
  | "e1rm"
  | "volume"
  | "custom";
export type GoalStatus = "active" | "achieved" | "abandoned";

/* ------------------------------------------------------------------ */
/* DB row interfaces (1:1 with tables)                                 */
/* ------------------------------------------------------------------ */

/** profiles — 1:1 with auth.users; `id` = auth.uid(). */
export interface Profile {
  id: string;
  display_name: string | null;
  unit: Unit;
  start_date: string | null;
  deload_week: number;
  /** Optional tuned engine weights; null = engine DEFAULT_WEIGHTS. */
  readiness_weights: ReadinessWeights | null;
  /** Estimated maintenance calories; basis for the weekly deficit tracker. */
  maintenance_calories: number | null;
  /** Steps/day the maintenance figure assumes; days under it trim the burn. null = 10000. */
  maintenance_step_baseline: number | null;
  /** Deficit outlier filter: ignore completed days under this many kcal. null = off. */
  nutrition_min_calories: number | null;
  created_at: string;
}

/** programs */
export interface Program {
  id: string;
  user_id: string;
  name: string;
  length_weeks: number;
  deload_week: number;
  is_active: boolean;
  /** Per-program mesocycle anchor; the active program's date drives "current week". */
  start_date: string | null;
  created_at: string;
}

/** program_days */
export interface ProgramDay {
  id: string;
  program_id: string;
  user_id: string;
  day_number: number;
  label: string;
}

/** exercise_slots */
export interface ExerciseSlot {
  id: string;
  day_id: string;
  user_id: string;
  slot_code: string;
  order_index: number;
  exercise_name: string;
  muscle_area: string | null;
  progress_bias: ProgressBias;
  rep_low: number;
  rep_high: number;
  target_rir: number;
  base_sets: number;
  load_increment: number;
  seed_load: number | null;
  /** Bodyweight movement (pull-up/dip): the engine progresses reps/sets only,
   *  never an automatic load bump. The user may still log their own added load. */
  is_bodyweight: boolean;
}

/** sessions */
export interface Session {
  id: string;
  user_id: string;
  program_id: string;
  day_id: string;
  week: number;
  performed_at: string | null;
  status: SessionStatus;
  created_at: string;
}

/** set_logs */
export interface SetLog {
  id: string;
  user_id: string;
  session_id: string;
  slot_id: string;
  week: number;
  actual_load: number | null;
  best_reps: number | null;
  actual_sets: number | null;
  actual_rir: number | null;
  hit_rir_override: RirOverride | null;
  pump: number | null;
  enjoyment: number | null;
  soreness: number | null;
  recovery: number | null;
  performance: Performance | null;
  notes: string | null;
  created_at: string;
}

/** set_entries — one row per actual set; unique (session_id, slot_id, set_number) */
export interface SetEntry {
  id: string;
  user_id: string;
  session_id: string;
  slot_id: string;
  set_number: number;
  load: number | null;
  reps: number | null;
  rir: number | null;
  created_at: string;
}

/** body_metrics — unique (user_id, measured_on) */
export interface BodyMetric {
  id: string;
  user_id: string;
  measured_on: string;
  bodyweight: number | null;
  bodyfat_pct: number | null;
  notes: string | null;
  /** 'manual' (app entry) | 'wearable' (imported). Manual is never overwritten. */
  source: string;
  created_at: string;
}

/** blocks — training or diet phases on a timeline */
export interface Block {
  id: string;
  user_id: string;
  kind: BlockKind;
  name: string;
  goal: string | null;
  phase: BlockPhase | null;
  start_date: string | null;
  end_date: string | null;
  length_weeks: number | null;
  program_id: string | null;
  calorie_target: number | null;
  protein_target: number | null;
  carb_target: number | null;
  fat_target: number | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

/** goals */
export interface Goal {
  id: string;
  user_id: string;
  title: string;
  metric_type: GoalMetricType;
  exercise_name: string | null;
  start_value: number | null;
  target_value: number | null;
  target_unit: string | null;
  target_date: string | null;
  status: GoalStatus;
  notes: string | null;
  created_at: string;
}

/** nutrition_logs — unique (user_id, logged_on) */
export interface NutritionLog {
  id: string;
  user_id: string;
  logged_on: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  notes: string | null;
  /** 'manual' (app entry) | 'wearable' (imported). Manual is never overwritten. */
  source: string;
  created_at: string;
}

/**
 * The LLM's read on a single lift. The AI INTERPRETS the deterministic
 * LiftAnalytic (it does not compute numbers) — `note` cites the figures, `advice`
 * gives the concrete next step.
 */
export interface LiftAdvice {
  exercise: string;
  status: "progressing" | "stalling" | "calibrating" | "regressing" | "maintaining";
  note: string;
  advice: string;
}

/** The LLM's read on a single goal, keyed to the goal's title. */
export interface GoalAdvice {
  title: string;
  status: "achieved" | "ahead" | "on_track" | "behind" | "no_data";
  note: string;
  recommendation: string;
}

/** A ranked next action with its rationale. */
export interface Priority {
  title: string;
  why: string;
}

/**
 * Structured LLM training overview. The AI INTERPRETS the deterministic
 * TrainingAnalytics (computed in code) into grounded, specific advice — it must
 * never invent or recompute numbers, only reference the provided figures.
 * Generated by the (allowlisted) analysis feature and cached so several screens
 * read one analysis. `focus` keeps powering the Today nudge.
 */
export interface AnalysisPayload {
  /** One-line headline summarizing where training stands right now. */
  headline: string;
  /** 1-2 sentence big-picture overview that references real numbers. */
  overview: string;
  /** Overall mesocycle / goal pacing read, with specifics. */
  pacing: string;
  training: {
    summary: string;
    lifts: LiftAdvice[];
    laggingMuscles: string[];
    strongAreas: string[];
  };
  goals: {
    summary: string;
    items: GoalAdvice[];
  };
  body: { summary: string; trajectory: string };
  nutrition: { summary: string; advice: string };
  /** Ranked, specific next actions with rationale. */
  priorities: Priority[];
  /** Up to ~3 short bullets for the Today nudge (derived from priorities). */
  focus: string[];
}

/** ai_analyses — cached structured overview from the LLM. */
export interface AiAnalysis {
  id: string;
  user_id: string;
  model: string | null;
  payload: AnalysisPayload;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/* Wearable sync (steps + sleep via the Google Health API)             */
/* ------------------------------------------------------------------ */

export type WearableProvider = "google_health";
export type WearableStatus = "active" | "reauth_required";

/**
 * wearable_connections — one row per connected provider per user. The OAuth
 * access/refresh tokens are stored ENCRYPTED (AES-256-GCM) at rest; never expose
 * them to the client. The daily cron reads/refreshes them with the service role.
 */
export interface WearableConnection {
  id: string;
  user_id: string;
  provider: WearableProvider;
  /** Stable Google Health user id (from /users/me/identity). */
  google_health_user_id: string | null;
  /** Encrypted; decrypt server-side only. */
  access_token: string | null;
  /** Encrypted; decrypt server-side only. */
  refresh_token: string | null;
  token_expires_at: string | null;
  scopes: string[] | null;
  status: WearableStatus;
  created_at: string;
  updated_at: string;
}

/**
 * recovery_metrics — one row per user per day, sourced from a wearable. No
 * calorie/energy columns here: wearable BURNED-calorie estimates aren't imported
 * (logged INTAKE calories sync into nutrition_logs instead).
 */
export interface RecoveryMetric {
  id: string;
  user_id: string;
  metric_date: string;
  steps: number | null;
  sleep_minutes_asleep: number | null;
  sleep_minutes_in_period: number | null;
  sleep_light_min: number | null;
  sleep_deep_min: number | null;
  sleep_rem_min: number | null;
  sleep_awake_min: number | null;
  resting_hr: number | null;
  hrv_ms: number | null;
  source: string;
  synced_at: string;
}

/* ------------------------------------------------------------------ */
/* Shared UI / view-model types                                        */
/* ------------------------------------------------------------------ */

/** A program with its days and slots, ordered for rendering. */
export interface ProgramFull {
  program: Program;
  days: ProgramDay[];
  slots: ExerciseSlot[];
}

/** Per-week prescribed targets for a slot (from the engine target fns). */
export interface SlotTargets {
  load: number | null;
  sets: number | null;
  reps: number | null;
  rir: number | null;
}

/**
 * One row of the Today view: a slot, its logged set (if any), the prescribed
 * targets for the week, and the engine's decision readout.
 */
export interface SlotView {
  slot: ExerciseSlot;
  log: SetLog | null;
  /** Individual sets logged for this slot (ordered by set_number). */
  entries: SetEntry[];
  targets: SlotTargets;
  result: import("@/lib/engine/engine").EngineResult;
}
