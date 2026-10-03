import type { SupabaseClient } from '@supabase/supabase-js'
import { cache } from 'react'

export type SessionUser = { id: string; email: string | null }

/**
 * The project signs sessions with an asymmetric (ES256) key, so `getClaims()`
 * verifies the JWT locally against the cached JWKS instead of round-tripping
 * to Supabase Auth like `getUser()` does. Deduped per render via `cache()`.
 */
export const getCachedUser = cache(
  async (supabase: SupabaseClient): Promise<SessionUser | null> => {
    const { data, error } = await supabase.auth.getClaims()
    if (error || !data?.claims?.sub) return null
    const email = data.claims.email
    return {
      id: data.claims.sub,
      email: typeof email === 'string' && email.length > 0 ? email : null,
    }
  },
)

/**
 * Resolve the authenticated user id, or throw. Every insert in the data layer
 * stamps user_id with this value (RLS also enforces it server-side).
 */
export async function requireUserId(supabase: SupabaseClient): Promise<string> {
  const user = await getCachedUser(supabase)
  if (!user) {
    throw new Error('Not authenticated')
  }
  return user.id
}
