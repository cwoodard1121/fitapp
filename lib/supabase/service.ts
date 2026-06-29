/**
 * Service-role Supabase client for background jobs with NO user session (the
 * daily wearable-sync cron). The service role BYPASSES RLS, which is required
 * here because a scheduled run has no auth.uid() — so callers MUST scope every
 * query by user_id themselves.
 *
 * Server-only. SUPABASE_SERVICE_ROLE_KEY must never be exposed to the browser
 * (do not prefix it with NEXT_PUBLIC_).
 */
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

import { requireSupabaseEnv } from '@/lib/supabase/env'

export function createServiceClient() {
  const { url } = requireSupabaseEnv()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
