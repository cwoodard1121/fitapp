/**
 * AI training overview: compute deterministic analytics, ask the LLM to
 * INTERPRET those numbers into grounded advice, validate it, and cache it.
 *
 * Server-only. The deterministic analytics are computed in code (lib/analytics)
 * and are always available; the LLM never invents or recomputes numbers — it
 * receives the analytics as JSON and writes analysis + advice + pacing keyed to
 * the provided figures. The cached AnalysisPayload feeds several screens
 * (Progress, Goals, a Today focus nudge), so it stays structured, not a chat.
 */
import { z } from 'zod'

import type { AiAnalysis, AnalysisPayload } from '@/lib/types'
import { requireUserId } from '@/lib/data'
import { getAnalysisAccess } from '@/lib/ai/allowlist'
import { gatherAnalytics } from '@/lib/analytics'
import type { TrainingAnalytics } from '@/lib/analytics/types'
import { createClient } from '@/lib/supabase/server'

import { callOpenAIJson } from './openai'

/* ------------------------------------------------------------------ */
/* Schema — EXACTLY mirrors the (richer) AnalysisPayload, tolerant      */
/* ------------------------------------------------------------------ */

/** Coerce anything to a string, defaulting to '' (used for exact-match keys). */
const str = z.preprocess((v) => (typeof v === 'string' ? v : ''), z.string())

/**
 * Humanize identifiers the model may echo straight from the analytics JSON keys
 * (e.g. "weeklyRate" -> "weekly rate", "weeklyE1rmRate" -> "weekly e1rm rate",
 * "no_data" -> "no data") so internal field names never reach the UI.
 * Conservative by design: it only rewrites snake_case and lower-camelCase tokens,
 * which don't occur in normal coaching prose. The camel pass keys off a
 * lowercase-LETTER -> uppercase transition, so display terms whose only humps are
 * digit/upper (e1RM, 1RM, 5RM) plus RIR, 5x5, lb/wk and proper nouns stay intact.
 */
function humanizeIdentifiers(s: string): string {
  return s
    // snake_case (and ALLCAPS_SNAKE via the i flag): foo_bar -> foo bar
    .replace(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/gi, (m) => m.replace(/_/g, ' '))
    // lower-camelCase, including digit-glued humps like weeklyE1rmRate. Requires a
    // lowercase letter immediately before the first capital so "e1RM" is untouched.
    .replace(/\b[a-z][a-z0-9]*[a-z][A-Z][A-Za-z0-9]*\b/g, (m) =>
      m.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(),
    )
}

/** A free-text field: coerced to string, with any leaked identifiers humanized. */
const prose = z.preprocess(
  (v) => (typeof v === 'string' ? humanizeIdentifiers(v) : ''),
  z.string(),
)

/** Coerce to a human-tag array (identifiers humanized), clamped to <= `max`. */
function proseList(max: number) {
  return z.preprocess(
    (v) =>
      Array.isArray(v)
        ? v.filter((x) => typeof x === 'string').map(humanizeIdentifiers)
        : [],
    z.array(z.string()).transform((a) => a.slice(0, max)),
  )
}

/** A tolerant enum: unknown / missing values fall back to `fallback`. */
function enumish<T extends string>(values: readonly T[], fallback: T) {
  return z.preprocess(
    (v) => (typeof v === 'string' && (values as readonly string[]).includes(v) ? v : fallback),
    z.enum(values as unknown as [T, ...T[]]),
  )
}

/** Wrap an object so a missing / non-object value becomes {} (fields default). */
function obj<T extends z.ZodRawShape>(shape: T) {
  return z.preprocess(
    (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {}),
    z.object(shape),
  )
}

/** Coerce to an array of objects, then parse+clamp to <= `max` items. */
function objList<T extends z.ZodTypeAny>(item: T, max = 8) {
  return z.preprocess(
    (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object' && !Array.isArray(x)) : []),
    z.array(item).transform((a) => a.slice(0, max)),
  )
}

const liftAdvice = z.object({
  exercise: str,
  status: enumish(
    ['progressing', 'stalling', 'calibrating', 'regressing', 'maintaining'] as const,
    'maintaining',
  ),
  note: prose,
  advice: prose,
})

const goalAdvice = z.object({
  title: str,
  status: enumish(
    ['achieved', 'ahead', 'on_track', 'behind', 'no_data'] as const,
    'no_data',
  ),
  note: prose,
  recommendation: prose,
})

const priority = z.object({ title: prose, why: prose })

export const analysisSchema = z.object({
  headline: prose,
  overview: prose,
  pacing: prose,
  training: obj({
    summary: prose,
    lifts: objList(liftAdvice),
    laggingMuscles: proseList(6),
    strongAreas: proseList(6),
  }),
  goals: obj({
    summary: prose,
    items: objList(goalAdvice),
  }),
  body: obj({ summary: prose, trajectory: prose }),
  nutrition: obj({ summary: prose, advice: prose }),
  priorities: objList(priority, 3),
  focus: proseList(3),
})

/* ------------------------------------------------------------------ */
/* Prompt                                                              */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You are a sharp strength & physique coach writing a SHORT overview for an athlete. You are GIVEN computed analytics as JSON — never invent or recompute numbers; reference ONLY the provided figures (e1RM rates, % complete, required vs current weekly rates, projected arrival dates, volume, adherence, mesocycle week). When a figure is null/missing, say the data is thin rather than guessing.

Write like a coach talking, NOT like a data export:
- Plain, natural language only. NEVER put JSON field names or code-style identifiers in any text — no camelCase, no snake_case. Write "trending about +0.4 lb/week", not "weeklyRate 0.4"; write "not enough data yet", not "no_data". The status values are the ONLY exception and belong solely in "status" fields.
- Be brief and scannable. Lead with the signal; cut filler. Round numbers. Don't repeat the same point across sections.

Return ONLY a JSON object (no markdown, no prose outside the JSON) with EXACTLY this shape:
{
  "headline": string,            // ONE short line: the single most important read right now
  "overview": string,            // 1-2 sentences — the big picture with a couple of real numbers
  "pacing": string,              // ONE sentence on mesocycle/goal pacing (week X of Y, ahead/behind, an arrival date)
  "training": {
    "summary": string,           // ONE sentence on how the lifts are trending overall
    "lifts": [                   // one entry per lift in analytics.lifts (<= 8)
      {
        "exercise": string,      // exact name from the analytics
        "status": "progressing" | "stalling" | "calibrating" | "regressing" | "maintaining",
        "note": string,          // ONE short clause citing its key figure (e1RM change, trend, stalled?)
        "advice": string         // ONE concrete next step for this lift — a few words
      }
    ],
    "laggingMuscles": string[],  // muscle areas low on volume or stalled — names only (<= 6)
    "strongAreas": string[]      // muscle areas / lifts moving well — names only (<= 6)
  },
  "goals": {
    "summary": string,           // ONE sentence on overall goal progress
    "items": [                   // one entry per goal in analytics.goals (<= 8), matched by title
      {
        "title": string,         // exact goal title from the analytics
        "status": "achieved" | "ahead" | "on_track" | "behind" | "no_data",
        "note": string,          // ONE short clause: % done, needed vs current pace, or arrival date
        "recommendation": string // ONE concrete action — a few words
      }
    ]
  },
  "body": { "summary": string, "trajectory": string },   // ONE line each: weight/bodyfat now, then the direction
  "nutrition": { "summary": string, "advice": string },  // ONE line each: intake vs targets, then one adjustment
  "priorities": [                // the TOP 3 next actions, most important first (<= 3)
    { "title": string, "why": string }   // title: a few words; why: one short clause
  ],
  "focus": string[]              // <= 3 very short bullets for a Today nudge, drawn from priorities
}

Echo each lift's exact "exercise" and each goal's exact "title" so the app can match them. Pick the status the figures imply. If a section has no data, keep its strings empty/brief and use empty arrays. Never output a number that is not in the analytics.`

/* ------------------------------------------------------------------ */
/* Generation + storage                                               */
/* ------------------------------------------------------------------ */

const MAX_INPUT_CHARS = 12000

/** Default per-array caps — top-N most relevant rows kept for the LLM. */
const DEFAULT_CAPS = { lifts: 12, goals: 12, volume: 12 }

/* --- Adaptive output budget ----------------------------------------------- *
 * gpt-5.4 reasoning tokens are billed against max_output_tokens, so a fixed cap
 * can be eaten by reasoning and leave no room for the JSON (-> empty/truncated
 * output -> failed parse). The model writes one advice block per lift and per
 * goal, so we scale the budget: a fixed reasoning headroom + base scaffolding
 * plus a per-lift and per-goal allowance, clamped to a sane band. */
const OUT_BASE = 1500 // overview + pacing + priorities + body/nutrition + JSON scaffold
const OUT_REASONING_HEADROOM = 2500 // medium reasoning is billed against the cap
const OUT_PER_LIFT = 150
const OUT_PER_GOAL = 150
const OUT_MIN = 3000
const OUT_MAX = 16000

/** Tokens to allow the model, scaled by how many lifts/goals it must write up. */
function outputBudget(analytics: TrainingAnalytics): number {
  const nLifts = Math.min(analytics.lifts.length, DEFAULT_CAPS.lifts)
  const nGoals = Math.min(analytics.goals.length, DEFAULT_CAPS.goals)
  const want =
    OUT_BASE + OUT_REASONING_HEADROOM + OUT_PER_LIFT * nLifts + OUT_PER_GOAL * nGoals
  return Math.min(OUT_MAX, Math.max(OUT_MIN, want))
}

type ArrayCaps = { lifts: number; goals: number; volume: number }

/** Round stray floats to 2dp; pass everything else through untouched. */
function roundFloats(_key: string, value: unknown): unknown {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value * 100) / 100
    : value
}

/**
 * Clamp the unbounded arrays to the top-N most relevant rows: lifts by session
 * count, volume by tonnage, and goals in their existing active-first order. The
 * other (bounded) sections pass through unchanged.
 */
function clampAnalytics(analytics: TrainingAnalytics, caps: ArrayCaps): TrainingAnalytics {
  const lifts = [...analytics.lifts]
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, caps.lifts)
  const goals = analytics.goals.slice(0, caps.goals)
  const volume = [...analytics.volume]
    .sort((a, b) => b.weeklyTonnage - a.weeklyTonnage)
    .slice(0, caps.volume)
  return { ...analytics, lifts, goals, volume }
}

/**
 * Serialize analytics as compact JSON, rounding stray floats. Caps the size
 * STRUCTURALLY (whole rows, ranked by relevance) so the payload is always
 * well-formed JSON within budget — a raw `slice()` could truncate mid-object
 * into invalid JSON for power users with many lifts/goals. The length check is
 * only a backstop, applied by shedding more whole rows (never a mid-JSON cut).
 */
function serializeAnalytics(analytics: TrainingAnalytics): string {
  let caps: ArrayCaps = { ...DEFAULT_CAPS }
  let json = JSON.stringify(clampAnalytics(analytics, caps), roundFloats)

  // Backstop on already-valid JSON: if the clamped payload still overruns (e.g.
  // very long string fields), halve the caps and re-serialize whole rows until
  // it fits or there is nothing left to drop.
  while (
    json.length > MAX_INPUT_CHARS &&
    (caps.lifts > 1 || caps.goals > 1 || caps.volume > 1)
  ) {
    caps = {
      lifts: Math.max(1, Math.floor(caps.lifts / 2)),
      goals: Math.max(1, Math.floor(caps.goals / 2)),
      volume: Math.max(1, Math.floor(caps.volume / 2)),
    }
    json = JSON.stringify(clampAnalytics(analytics, caps), roundFloats)
  }
  return json
}

/**
 * Compute analytics, ask the LLM to interpret them into the structured overview,
 * validate it, store it in ai_analyses, and return the payload.
 */
export async function generateAndStoreAnalysis(): Promise<AnalysisPayload> {
  // Defense-in-depth: the gate travels with the paid OpenAI call, not just the
  // action that fronts it.
  const { allowed } = await getAnalysisAccess()
  if (!allowed) throw new Error('Analysis is not enabled for this account.')

  const supabase = await createClient()
  const userId = await requireUserId(supabase)

  const analytics = await gatherAnalytics()
  const raw = await callOpenAIJson({
    system: SYSTEM_PROMPT,
    user: `Here are the computed analytics (JSON). Interpret them — do not change the numbers:\n\n${serializeAnalytics(analytics)}`,
    maxOutputTokens: outputBudget(analytics),
  })

  const payload = analysisSchema.parse(raw)
  const model = process.env.OPENAI_ANALYSIS_MODEL || 'gpt-5.4'

  const { error } = await supabase
    .from('ai_analyses')
    .insert({ user_id: userId, model, payload })
  if (error) throw new Error(error.message)

  return payload
}

/** Newest cached analysis for the current user, or null. */
export async function getLatestAnalysis(): Promise<AiAnalysis | null> {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)

  const { data, error } = await supabase
    .from('ai_analyses')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  const row = (data as AiAnalysis | null) ?? null
  if (!row) return null

  // A legacy / malformed cached payload must not crash the pages that read it.
  const parsed = analysisSchema.safeParse(row.payload)
  if (!parsed.success) return null
  return { ...row, payload: parsed.data }
}

/**
 * Convenience for the pages: ALWAYS compute the deterministic analytics, and
 * return the cached LLM advice alongside (null when none / not generated). The
 * analytics need no allowlist or LLM; only the analysis is gated + cached.
 */
export async function getAnalyticsAndAnalysis(): Promise<{
  analytics: TrainingAnalytics
  analysis: AiAnalysis | null
}> {
  const [analytics, analysis] = await Promise.all([
    gatherAnalytics(),
    getLatestAnalysis(),
  ])
  return { analytics, analysis }
}
