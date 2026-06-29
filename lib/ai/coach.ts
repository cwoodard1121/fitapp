/**
 * AI coach chat — a conversational layer on top of the SAME deterministic
 * analytics the structured overview uses. The model is GROUNDED in the user's
 * real computed numbers (lib/analytics). Chats are intentionally ephemeral (not
 * persisted): every new chat is re-seeded with the latest analytics, so a fresh
 * thread already "knows" the athlete's goals, lifts, body, and nutrition.
 *
 * Server-only: reads process.env.OPENAI_API_KEY and must never be imported into
 * a client component. The /api/coach route handler owns auth + the allowlist
 * gate; this module only builds the prompt and makes the OpenAI call.
 *
 * Non-streaming by design. gpt-5.4 is a reasoning model: it emits NO output
 * tokens until reasoning finishes, so token-by-token streaming would show
 * nothing during the (dominant) thinking phase anyway — and a streamed response
 * is fragile on Vercel (buffering / function-duration). A single request/reply,
 * exactly like the AI overview, is reliable in the same deployment.
 */
import type { Profile } from '@/lib/types'
import { gatherAnalytics } from '@/lib/analytics'
import type { TrainingAnalytics } from '@/lib/analytics/types'
import { getProfile } from '@/lib/data'

/** One chat turn. Roles mirror the OpenAI message roles we forward. */
export interface CoachMessage {
  role: 'user' | 'assistant'
  content: string
}

/* ------------------------------------------------------------------ */
/* Grounding — serialize the real analytics for the system prompt      */
/* ------------------------------------------------------------------ */

/** Keep the lift list bounded for power users: top-N by logged sessions. */
const MAX_LIFTS = 16
const MAX_INPUT_CHARS = 14000

/** Round stray floats to 2dp; pass everything else through untouched. */
function roundFloats(_key: string, value: unknown): unknown {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value * 100) / 100
    : value
}

/** Compact JSON of the analytics, ranked + capped so it always fits budget. */
function serializeAnalytics(analytics: TrainingAnalytics): string {
  const lifts = [...analytics.lifts]
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, MAX_LIFTS)
  let capped: TrainingAnalytics = { ...analytics, lifts }
  let json = JSON.stringify(capped, roundFloats)

  // Backstop: shed whole lift rows (never a mid-JSON cut) until within budget.
  let n = lifts.length
  while (json.length > MAX_INPUT_CHARS && n > 1) {
    n = Math.max(1, Math.floor(n / 2))
    capped = { ...analytics, lifts: lifts.slice(0, n) }
    json = JSON.stringify(capped, roundFloats)
  }
  return json
}

/**
 * Build the system prompt: who the coach is, how to behave, and the athlete's
 * real analytics as JSON. Pulls the live analytics + profile every call, so a
 * brand-new chat is always seeded with current numbers.
 */
export async function buildCoachSystemPrompt(): Promise<string> {
  const [analytics, profile] = await Promise.all([
    gatherAnalytics(),
    getProfile().catch(() => null as Profile | null),
  ])

  const unit = profile?.unit ?? 'lb'
  const name = profile?.display_name?.trim() || 'the athlete'

  return `You are "Coach", the in-app strength & physique coach inside ${name}'s training app (simplegym). You're chatting with the athlete. Below are their REAL, current numbers — computed by the app, not by you.

GROUND every claim in the figures below. Never invent numbers, trends, dates, or progress that isn't there. If a figure is null/missing or the data is thin (e.g. early in a mesocycle), say so plainly and give sound general best-practice guidance instead of guessing.

Style — talk like a sharp coach in a chat, not a data export:
- Lead with the answer. Be concise and warm; short paragraphs and "- " bullets. No headings, minimal markdown.
- Use the athlete's unit (${unit}) and round numbers. Write naturally ("bench is up about 12 lb over 6 weeks"), never code-style field names (no camelCase/snake_case).
- Pull only the figures relevant to the question — don't dump every stat. It's fine to ask a clarifying question.

Scope you can speak to from the data: per-lift e1RM trends/rates and stalls, the autoregulation engine's recent decisions, weekly volume by muscle, goal pacing/projected ETAs, bodyweight & body-fat trajectory, nutrition adherence vs targets, and mesocycle position — plus general strength/hypertrophy/recovery coaching. You can't log workouts or change app data from chat; for that, point them to the relevant screen (Today, Body, Nutrition, Goals, Settings).

ATHLETE ANALYTICS (JSON, the source of truth — interpret, don't recompute):
${serializeAnalytics(analytics)}`
}

/* ------------------------------------------------------------------ */
/* OpenAI Responses call (non-streaming)                               */
/* ------------------------------------------------------------------ */

/** Cap how much of the conversation we forward, to bound input tokens. */
const MAX_TURNS = 24

/** Reasoning effort for coach replies (product preference: medium). */
const REASONING_EFFORT = 'medium'

/**
 * Output-token budget. Medium reasoning is billed against max_output_tokens, so
 * this must cover the (hidden) reasoning AND the visible answer — too low and
 * the reasoning eats the budget and the reply comes back empty.
 */
const MAX_OUTPUT_TOKENS = 4000

interface OpenAIResponse {
  output_text?: string
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>
  status?: string
  incomplete_details?: { reason?: string }
}

/** Pull the visible text out of a Responses payload (convenience or parts). */
function extractText(data: OpenAIResponse): string {
  if (typeof data.output_text === 'string' && data.output_text.length > 0) {
    return data.output_text
  }
  const parts: string[] = []
  for (const item of data.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.type === 'output_text' && typeof part.text === 'string') {
        parts.push(part.text)
      }
    }
  }
  return parts.join('')
}

/**
 * Ask the coach for a reply to the given conversation and return its text.
 * Throws on missing key / non-200 / empty output so the route can map it to a
 * clean HTTP error.
 */
export async function getCoachReply(messages: CoachMessage[]): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set')

  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  const model =
    process.env.OPENAI_CHAT_MODEL || process.env.OPENAI_ANALYSIS_MODEL || 'gpt-5.4'

  const system = await buildCoachSystemPrompt()
  const turns = messages.slice(-MAX_TURNS)

  const res = await fetch(`${baseUrl}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: [{ role: 'system', content: system }, ...turns],
      reasoning: { effort: REASONING_EFFORT },
      max_output_tokens: MAX_OUTPUT_TOKENS,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenAI request failed (${res.status}): ${body.slice(0, 300)}`)
  }

  const data = (await res.json()) as OpenAIResponse
  const text = extractText(data).trim()
  if (!text) {
    // No visible text — for a reasoning model this usually means reasoning ate
    // the whole max_output_tokens budget (status 'incomplete').
    const reason = data.incomplete_details?.reason
    throw new Error(
      `OpenAI returned no text (status: ${data.status ?? 'unknown'}${
        reason ? `, reason: ${reason}` : ''
      }). Likely the reasoning used the whole token budget — raise max_output_tokens.`,
    )
  }
  return text
}
