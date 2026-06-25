/**
 * Email allowlist gate for the AI analysis feature. The overview is a paid
 * (OpenAI) call, so it is restricted to specific accounts via the
 * ANALYSIS_ALLOWED_EMAILS env var. When unset, only the owner is allowed.
 */
import { createClient } from '@/lib/supabase/server'

/** Fallback allowed account when ANALYSIS_ALLOWED_EMAILS is unset/empty. */
const DEFAULT_ALLOWED = ['cameronwoodard1121@gmail.com']

/** Parse ANALYSIS_ALLOWED_EMAILS into a normalized (lowercased, trimmed) list. */
function allowedEmails(): string[] {
  const raw = process.env.ANALYSIS_ALLOWED_EMAILS ?? ''
  const parsed = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0)
  return parsed.length > 0 ? parsed : DEFAULT_ALLOWED
}

/**
 * Whether the given email is allowed to use the analysis feature. Pure: compares
 * case-insensitively against the parsed allowlist.
 */
export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false
  const normalized = email.trim().toLowerCase()
  if (!normalized) return false
  return allowedEmails().includes(normalized)
}

/**
 * Resolve the current user's analysis access from their session email.
 * Returns the email so callers can show "enabled for X" if useful.
 */
export async function getAnalysisAccess(): Promise<{
  allowed: boolean
  email: string | null
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const email = user?.email ?? null
  return { allowed: isEmailAllowed(email), email }
}
