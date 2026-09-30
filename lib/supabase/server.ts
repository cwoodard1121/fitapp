import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { requireSupabaseEnv } from '@/lib/supabase/env'

type CookieToSet = { name: string; value: string; options?: CookieOptions }

/**
 * Server-side Supabase client (Server Components, Route Handlers, Server Actions).
 * Next 15: cookies() is async and must be awaited.
 *
 * Wrapped in React's `cache()` so every data helper that calls this within
 * the same render gets back the SAME client instance instead of a fresh one
 * each time. That's what lets `requireUserId`'s auth check (below) actually
 * dedupe — a page that fan-outs into half a dozen `getX()` calls was
 * independently re-validating the session with Supabase's Auth server on
 * every single one of them (`auth.getUser()` always hits the network, unlike
 * `getSession()`), which is the dominant cost behind "queries are slow."
 * `cache()` is per-request/per-render only; a Route Handler still gets a
 * fresh client per invocation since there's no React render to scope it to,
 * but those already only call this once.
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies()
  const { url, key } = requireSupabaseEnv()

  return createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Called from a Server Component where cookies are read-only.
            // The session refresh is handled by middleware, so this is safe to ignore.
          }
        },
      },
    },
  )
})
