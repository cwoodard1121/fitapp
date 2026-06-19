import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser-side Supabase client (Client Components only).
 * Uses the public anon key + cookie-based session managed by @supabase/ssr.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
