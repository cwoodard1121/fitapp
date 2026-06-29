/**
 * AI coach chat — a conversational layer on top of the SAME deterministic
 * analytics the structured overview uses. The model is GROUNDED in the user's
 * real computed numbers (lib/analytics) and streams its reply back token by
 * token. Chats are intentionally ephemeral (not persisted): every new chat is
 * re-seeded with the latest analytics, so a fresh thread already "knows" the
 * athlete's goals, lifts, body, and nutrition.
 *
 * Server-only: reads process.env.OPENAI_API_KEY and must never be imported into
 * a client component. The /api/coach route handler owns auth + the allowlist
 * gate; this module only builds the prompt and the streaming transport.
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
/* Streaming transport — OpenAI Responses API (SSE -> text deltas)     */
/* ------------------------------------------------------------------ */

/** Cap how much of the conversation we forward, to bound input tokens. */
const MAX_TURNS = 24

/**
 * Stream a coach reply for the given conversation. Returns a ReadableStream of
 * UTF-8 text chunks (the assistant's visible answer, delta by delta).
 *
 * Throws synchronously on missing key / non-200 upstream so the route can turn
 * it into a clean HTTP error BEFORE any streaming begins. Errors that occur
 * mid-stream are surfaced as a trailing text note (the stream has already
 * started, so we can't change the status code).
 */
export async function streamCoachReply(
  messages: CoachMessage[],
): Promise<ReadableStream<Uint8Array>> {
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
      // Chat wants snappy replies; keep reasoning light.
      reasoning: { effort: 'low' },
      max_output_tokens: 2000,
      stream: true,
    }),
  })

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenAI request failed (${res.status}): ${body.slice(0, 300)}`)
  }

  return toTextStream(res.body)
}

/**
 * Adapt the OpenAI Responses SSE byte stream to a plain UTF-8 text stream of
 * just the visible answer. We parse `data:` frames and forward the text from
 * `response.output_text.delta` events; we surface `response.error` / refusals
 * as a short trailing note rather than silently truncating.
 */
function toTextStream(
  upstream: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const reader = upstream.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ''
  let sawText = false

  const EMPTY_REPLY = "I couldn't generate a reply just now — give it another try."

  async function cancelUpstream(): Promise<void> {
    try {
      await reader.cancel()
    } catch {
      /* already closed */
    }
  }

  /** Pull one `data:` JSON event's text contribution (or null). */
  function handleEvent(json: string): {
    text?: string
    error?: string
    done?: boolean
    truncated?: boolean
  } {
    const trimmed = json.trim()
    if (!trimmed || trimmed === '[DONE]') return {}
    let evt: {
      type?: string
      delta?: string
      refusal?: string
      response?: { error?: { message?: string } }
      error?: { message?: string }
      message?: string
    }
    try {
      evt = JSON.parse(trimmed)
    } catch {
      return {}
    }
    switch (evt.type) {
      case 'response.output_text.delta':
        return typeof evt.delta === 'string' ? { text: evt.delta } : {}
      case 'response.refusal.delta':
        return typeof evt.delta === 'string' ? { text: evt.delta } : {}
      case 'response.completed':
        return { done: true }
      case 'response.incomplete':
        // Hit max_output_tokens (or otherwise truncated): terminal like
        // completed, but flag it so we can note the cut-off.
        return { done: true, truncated: true }
      case 'response.failed':
      case 'error':
      case 'response.error':
        return {
          error:
            evt.response?.error?.message ||
            evt.error?.message ||
            evt.message ||
            'the model stopped unexpectedly',
        }
      default:
        return {}
    }
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) {
          // Upstream closed without a terminal event — backfill a note if the
          // model produced nothing.
          if (!sawText) controller.enqueue(encoder.encode(EMPTY_REPLY))
          controller.close()
          return
        }

        buffer += decoder.decode(value, { stream: true })
        // SSE frames are separated by blank lines; process complete lines.
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const { text, error, done: evtDone, truncated } = handleEvent(line.slice(5))
          if (text) {
            sawText = true
            controller.enqueue(encoder.encode(text))
          } else if (error) {
            // Terminal: emit exactly ONE note and stop, so the reader-done
            // fallback can't also fire and concatenate a second message.
            controller.enqueue(
              encoder.encode(sawText ? `\n\n[interrupted: ${error}]` : `⚠️ ${error}`),
            )
            controller.close()
            await cancelUpstream()
            return
          } else if (evtDone) {
            if (truncated && sawText) {
              controller.enqueue(
                encoder.encode('\n\n[cut off — ask a shorter follow-up]'),
              )
            } else if (!sawText) {
              controller.enqueue(encoder.encode(EMPTY_REPLY))
            }
            controller.close()
            await cancelUpstream()
            return
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'stream error'
        controller.enqueue(encoder.encode(`\n\n[connection dropped: ${msg}]`))
        controller.close()
      }
    },
    async cancel() {
      try {
        await reader.cancel()
      } catch {
        /* noop */
      }
    },
  })
}
