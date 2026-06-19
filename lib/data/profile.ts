import type { Profile } from '@/lib/types'
import { createClient } from '@/lib/supabase/server'
import { requireUserId } from '@/lib/data/auth'

/**
 * Read the current user's profile (1:1 with auth user, id = auth.uid()).
 * Returns null if the row does not exist yet.
 */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as Profile | null) ?? null
}

/**
 * Ensure a profile row exists. The handle_new_user() trigger normally creates
 * it on signup; this is a safety net (idempotent via upsert on conflict).
 */
export async function ensureProfile(): Promise<Profile> {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)

  const existing = await getProfile()
  if (existing) return existing

  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: userId }, { onConflict: 'id' })
    .select('*')
    .single()
  if (error) throw error
  return data as Profile
}
