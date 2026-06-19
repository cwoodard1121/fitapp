import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Resolve the authenticated user id, or throw. Every insert in the data layer
 * stamps user_id with this value (RLS also enforces it server-side).
 */
export async function requireUserId(supabase: SupabaseClient): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Not authenticated')
  }
  return user.id
}
