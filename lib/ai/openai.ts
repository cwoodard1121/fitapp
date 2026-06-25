/**
 * Minimal OpenAI Responses API client for the analysis feature.
 *
 * Server-only: reads process.env secrets (OPENAI_API_KEY) and must never be
 * imported into a client component. Returns a tolerant-parsed JSON object so
 * callers can validate it against a zod schema.
 */

interface CallOpenAIJsonArgs {
  system: string
  user: string
  maxOutputTokens?: number
}

/**
 * Call the OpenAI Responses API and return the model's reply parsed as JSON.
 * Throws on missing key or non-200 responses; the caller decides how to surface
 * the error to the user.
 */
export async function callOpenAIJson({
  system,
  user,
  maxOutputTokens,
}: CallOpenAIJsonArgs): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set')

  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  const model = process.env.OPENAI_ANALYSIS_MODEL || 'gpt-5.4'

  const res = await fetch(`${baseUrl}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      reasoning: { effort: 'medium' },
      max_output_tokens: maxOutputTokens ?? 3000,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenAI request failed (${res.status}): ${body}`)
  }

  const data = (await res.json()) as OpenAIResponse
  const text = extractText(data)
  if (!text || text.trim() === '') {
    // The model produced no visible text. For a reasoning model this almost
    // always means the reasoning ate the whole max_output_tokens budget
    // (status 'incomplete', reason 'max_output_tokens') — raise the budget.
    const status = data.status ?? 'unknown'
    const reason = data.incomplete_details?.reason
    throw new Error(
      `OpenAI returned no text (status: ${status}${reason ? `, reason: ${reason}` : ''}). ` +
        'Likely max_output_tokens was too low for the reasoning model.',
    )
  }
  return tolerantParseJson(text)
}

/* ------------------------------------------------------------------ */
/* Response text extraction                                            */
/* ------------------------------------------------------------------ */

interface OpenAIResponse {
  output_text?: string
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>
  }>
  /** 'completed' | 'incomplete' | ... — present on the Responses API. */
  status?: string
  incomplete_details?: { reason?: string }
}

/**
 * Pull the text out of a Responses payload. Prefer the convenience
 * `output_text`; otherwise concatenate the `output_text` content parts.
 */
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
 * Parse model output that should be JSON but might be wrapped in ```json fences
 * or surrounded by prose. Falls back to the first '{' .. last '}' substring.
 */
function tolerantParseJson(raw: string): unknown {
  const stripped = raw
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()

  try {
    return JSON.parse(stripped)
  } catch {
    const first = stripped.indexOf('{')
    const last = stripped.lastIndexOf('}')
    if (first !== -1 && last !== -1 && last > first) {
      return JSON.parse(stripped.slice(first, last + 1))
    }
    throw new Error('OpenAI response was not valid JSON')
  }
}
