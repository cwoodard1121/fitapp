/**
 * POST /api/coach — return a grounded coach reply for the current conversation.
 *
 * The chat is ephemeral: the client holds the whole thread and posts it each
 * turn; we re-seed the grounding analytics server-side every call (see
 * lib/ai/coach.ts) and return the answer as JSON. Nothing is persisted. Gated to
 * allowlisted accounts — the LLM call is paid — exactly like the AI overview.
 */
import { z } from 'zod'

import { getAnalysisAccess } from '@/lib/ai/allowlist'
import { getCoachReply } from '@/lib/ai/coach'

// Cookie session (Supabase SSR) — Node runtime. gpt-5.4 reasoning can take tens
// of seconds, so raise the function budget well above Vercel's low default
// (Hobby caps at 60s; Pro allows up to 300s).
export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .min(1)
    .max(40),
})

function errorJson(status: number, error: string): Response {
  return Response.json({ error }, { status })
}

export async function POST(req: Request): Promise<Response> {
  // Same gate as the paid overview — the chat is an OpenAI call too.
  const { allowed } = await getAnalysisAccess()
  if (!allowed) return errorJson(403, 'Coach chat is not enabled for your account.')

  let json: unknown
  try {
    json = await req.json()
  } catch {
    return errorJson(400, 'Invalid request body.')
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) return errorJson(400, 'Invalid messages payload.')

  // The last turn must be the user's — we're answering it.
  const { messages } = parsed.data
  if (messages[messages.length - 1].role !== 'user') {
    return errorJson(400, 'The last message must be from the user.')
  }

  try {
    const reply = await getCoachReply(messages)
    return Response.json({ reply })
  } catch (e) {
    console.error('coach reply failed', e)
    const msg = e instanceof Error ? e.message : ''
    // Only allowlisted accounts reach here, so a specific reason is safe and
    // makes config problems self-diagnosable instead of a dead end.
    if (/OPENAI_API_KEY is not set/i.test(msg)) {
      return errorJson(
        503,
        'AI isn’t configured on the server yet (OPENAI_API_KEY missing). If you just added it in Vercel, redeploy so the running build picks it up.',
      )
    }
    return errorJson(502, `Coach is unavailable: ${msg ? msg.slice(0, 240) : 'unknown error'}`)
  }
}
