import type { SupabaseClient } from '@supabase/supabase-js'
import { cache } from 'react'

/**
 * `auth.getUser()` always makes a network round-trip to Supabase's Auth
 * server to revalidate the session (unlike `getSession()`, which trusts the
 * local cookie) — correct for security, expensive to repeat. `createClient()`
 * is itself `cache()`d per request, so every caller within one render passes
 * the SAME client instance here, which lets this dedupe down to one real
 * network call no matter how many `getX()` helpers ask for the user id.
 */
export const getCachedUser = cache(async (supabase: SupabaseClient) => {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

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
