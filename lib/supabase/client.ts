import { createBrowserClient } from '@supabase/ssr'
import { requireSupabaseEnv } from '@/lib/supabase/env'

/**
 * Browser-side Supabase client (Client Components only).
 * Uses the public anon key + cookie-based session managed by @supabase/ssr.
 * Env is normalized (auto https://, trimmed) and validated with a clear error.
 */
export function createClient() {
  const { url, key } = requireSupabaseEnv()
  return createBrowserClient(url, key)
}
