import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

type CookieToSet = { name: string; value: string; options?: CookieOptions }

/**
 * Refreshes the Supabase auth session on every request and guards routes.
 * - Unauthenticated users on protected routes are sent to /login.
 * - Authenticated users on /login are sent to /today.
 *
 * Fail-safe: a missing config or a transient Supabase error must NOT crash the
 * Edge function (which surfaces as a Vercel 500 MIDDLEWARE_INVOCATION_FAILED).
 * On any failure we let auth routes through and bounce everything else to /login.
 *
 * IMPORTANT: always return the same `supabaseResponse` object (or a redirect
 * that copies its cookies) so the refreshed session cookies survive.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const path = request.nextUrl.pathname
  // Auth plumbing routes must stay reachable without a session.
  const isAuthRoute = path === '/login' || path.startsWith('/auth')

  const redirectToLogin = () => {
    if (isAuthRoute) return supabaseResponse
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Env not configured (e.g. vars not set at build time) — degrade gracefully
  // to /login instead of throwing inside the Edge runtime.
  if (!supabaseUrl || !supabaseKey) {
    return redirectToLogin()
  }

  try {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    })

    // Do not run code between createServerClient and getUser() — it refreshes the token.
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user && !isAuthRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    if (user && path === '/login') {
      const url = request.nextUrl.clone()
      url.pathname = '/today'
      return NextResponse.redirect(url)
    }

    return supabaseResponse
  } catch {
    // Transient Supabase/Edge error — fail safe rather than 500 the whole site.
    return redirectToLogin()
  }
}
