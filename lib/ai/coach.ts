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
import { getActiveProgram, getProfile, getProgramFull } from '@/lib/data'
import {
  COACH_PROGRAM_TOOLS,
  executeCoachProgramTool,
} from '@/lib/ai/program-tools'
import { EXERCISE_CATALOG } from '@/lib/exercises/catalog'

/** One chat turn. Roles mirror the OpenAI message roles we forward. */
export interface CoachMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface CoachReply {
  reply: string
  actions: string[]
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
  const [analytics, profile, activeProgram] = await Promise.all([
    gatherAnalytics(),
    getProfile().catch(() => null as Profile | null),
    getActiveProgram().catch(() => null),
  ])
  const fullProgram = activeProgram
    ? await getProgramFull(activeProgram.id).catch(() => null)
    : null

  const unit = profile?.unit ?? 'lb'
  const name = profile?.display_name?.trim() || 'the athlete'
  const program = fullProgram
    ? {
        name: fullProgram.program.name,
        days: fullProgram.days.map((day) => ({
          dayNumber: day.day_number,
          label: day.label,
          exercises: fullProgram.slots
            .filter((slot) => slot.day_id === day.id)
            .sort((a, b) => a.order_index - b.order_index)
            .map((slot) => ({
              name: slot.exercise_name,
              sets: slot.base_sets,
              reps: [slot.rep_low, slot.rep_high],
              targetRir: slot.target_rir,
            })),
        })),
      }
    : null
  const exerciseLibrary = EXERCISE_CATALOG.map((exercise) => exercise.name)

  return `You are "Coach", the in-app strength & physique coach inside ${name}'s training app (simplegym). You're chatting with the athlete. Below are their REAL, current numbers — computed by the app, not by you.

GROUND every claim in the figures below. Never invent numbers, trends, dates, or progress that isn't there. If a figure is null/missing or the data is thin (e.g. early in a mesocycle), say so plainly and give sound general best-practice guidance instead of guessing.

Style — talk like a sharp coach in a chat, not a data export:
- Lead with the answer. Be concise and warm; short paragraphs and "- " bullets. No headings, minimal markdown.
- Use the athlete's unit (${unit}) and round numbers. Write naturally ("bench is up about 12 lb over 6 weeks"), never code-style field names (no camelCase/snake_case).
- Pull only the figures relevant to the question — don't dump every stat. It's fine to ask a clarifying question.

Scope you can speak to from the data: per-lift e1RM trends/rates and stalls, the autoregulation engine's recent decisions, weekly volume by muscle, goal pacing/projected ETAs, bodyweight & body-fat trajectory, nutrition adherence vs targets, and mesocycle position — plus general strength/hypertrophy/recovery coaching.

You can also edit the ACTIVE TRAINING PROGRAM with the supplied tools. Use them only when the athlete clearly asks to change the program. You may replace an exercise, change its sets/rep range/target RIR, add an exercise from the library, or remove an exercise. Never claim a change happened unless its tool returned ok=true. If the request is ambiguous about the day or exercise, ask one short clarifying question instead of guessing. Program tools preserve completed workout history and never rewrite set logs or frozen session targets. You still cannot log workouts or edit nutrition, body, goals, or completed sessions from chat — point the athlete to the relevant screen for those.

ATHLETE ANALYTICS (JSON, the source of truth — interpret, don't recompute):
${serializeAnalytics(analytics)}

ACTIVE TRAINING PROGRAM (JSON; null means none is active):
${JSON.stringify(program)}

EXERCISE LIBRARY (exact names accepted by program tools):
${JSON.stringify(exerciseLibrary)}`
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
const MAX_PROGRAM_TOOL_CALLS = 5

interface OpenAIOutputItem {
  type?: string
  name?: string
  arguments?: string
  call_id?: string
  content?: Array<{ type?: string; text?: string }>
  [key: string]: unknown
}

interface OpenAIResponse {
  output_text?: string
  output?: OpenAIOutputItem[]
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

async function requestCoachResponse(input: unknown[], options: {
  apiKey: string
  baseUrl: string
  model: string
}): Promise<OpenAIResponse> {
  const res = await fetch(`${options.baseUrl}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model,
      input,
      tools: COACH_PROGRAM_TOOLS,
      tool_choice: 'auto',
      parallel_tool_calls: false,
      reasoning: { effort: REASONING_EFFORT },
      max_output_tokens: MAX_OUTPUT_TOKENS,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `OpenAI request failed (${res.status}): ${body.slice(0, 300)}`,
    )
  }
  return (await res.json()) as OpenAIResponse
}

function savedActionsFallback(actions: string[]): CoachReply {
  const summary =
    actions.length === 1
      ? actions[0]
      : `Saved ${actions.length} program changes:\n${actions
          .map((action) => `- ${action}`)
          .join('\n')}`
  return {
    reply: `${summary}\n\nThose edits are saved. I couldn't finish the extra coach explanation, but your program is up to date.`,
    actions,
  }
}

/**
 * Ask the coach for a reply. When the model requests a safe program edit, run
 * it server-side, feed the result back with the matching call ID, then let the
 * model explain the outcome. Throws on missing key / non-200 / empty output so
 * the route can map it to a clean HTTP error.
 */
export async function getCoachReply(
  messages: CoachMessage[],
): Promise<CoachReply> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set')

  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  const model =
    process.env.OPENAI_CHAT_MODEL || process.env.OPENAI_ANALYSIS_MODEL || 'gpt-5.4'

  const system = await buildCoachSystemPrompt()
  const turns = messages.slice(-MAX_TURNS)
  const input: unknown[] = [{ role: 'system', content: system }, ...turns]
  const actions: string[] = []

  // One requested edit per response keeps mutations ordered and auditable.
  // The final request is reserved for confirmation, so no mutation can happen
  // without a subsequent chance to explain it.
  for (let round = 0; round <= MAX_PROGRAM_TOOL_CALLS; round += 1) {
    let data: OpenAIResponse
    try {
      data = await requestCoachResponse(input, { apiKey, baseUrl, model })
    } catch (error) {
      if (actions.length > 0) return savedActionsFallback(actions)
      throw error
    }

    const functionCalls = (data.output ?? []).filter(
      (item) => item.type === 'function_call',
    )
    if (functionCalls.length > 0) {
      if (functionCalls.length !== 1) {
        if (actions.length > 0) return savedActionsFallback(actions)
        throw new Error('OpenAI requested multiple program edits in one step.')
      }
      if (round === MAX_PROGRAM_TOOL_CALLS) {
        if (actions.length > 0) return savedActionsFallback(actions)
        throw new Error(
          'The coach requested too many program edits at once. Please split the request into smaller changes.',
        )
      }
      input.push(...(data.output ?? []))
      for (const call of functionCalls) {
        if (
          typeof call.name !== 'string' ||
          typeof call.arguments !== 'string' ||
          typeof call.call_id !== 'string'
        ) {
          if (actions.length > 0) return savedActionsFallback(actions)
          throw new Error('OpenAI returned an incomplete program tool call.')
        }
        const result = await executeCoachProgramTool(
          call.name,
          call.arguments,
        )
        if (result.ok) actions.push(result.message)
        input.push({
          type: 'function_call_output',
          call_id: call.call_id,
          output: JSON.stringify(result),
        })
      }
      continue
    }

    const text = extractText(data).trim()
    if (text) return { reply: text, actions }

    // No visible text — for a reasoning model this usually means reasoning ate
    // the whole max_output_tokens budget (status 'incomplete').
    const reason = data.incomplete_details?.reason
    const emptyOutputError = new Error(
      `OpenAI returned no text (status: ${data.status ?? 'unknown'}${
        reason ? `, reason: ${reason}` : ''
      }). Likely the reasoning used the whole token budget — raise max_output_tokens.`,
    )
    if (actions.length > 0) return savedActionsFallback(actions)
    throw emptyOutputError
  }

  return actions.length > 0
    ? savedActionsFallback(actions)
    : {
        reply: 'I could not complete that program edit. Please split it into a smaller change.',
        actions: [],
      }
}
