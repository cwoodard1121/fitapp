import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireSupabaseEnv } from '@/lib/supabase/env'

type CookieToSet = { name: string; value: string; options?: CookieOptions }

/**
 * Server-side Supabase client (Server Components, Route Handlers, Server Actions).
 * Next 15: cookies() is async and must be awaited.
 */
export async function createClient() {
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
}
