/**
 * GET /api/wearables/google/connect — start the Google Health OAuth flow.
 *
 * Allowlisted accounts only (the owner's personal integration). Sets a signed,
 * short-lived state cookie for CSRF, then 302-redirects to Google's consent
 * screen. The matching callback exchanges the code and stores the tokens.
 */
import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'

import { getAnalysisAccess } from '@/lib/ai/allowlist'
import { buildAuthUrl, OAUTH_STATE_COOKIE } from '@/lib/wearables/google-health'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request): Promise<Response> {
  const origin = new URL(req.url).origin
  const { allowed } = await getAnalysisAccess()
  if (!allowed) {
    return new Response('Wearable sync is not enabled for your account.', { status: 403 })
  }

  try {
    const state = randomBytes(16).toString('hex')
    const cookieStore = await cookies()
    cookieStore.set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      // Secure cookies are dropped over http://localhost, which would break the
      // state check in dev — only require Secure on https (i.e. prod).
      secure: origin.startsWith('https:'),
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    })
    return Response.redirect(buildAuthUrl(state), 302)
  } catch (e) {
    console.error('wearable connect failed', e)
    // Misconfig (missing GOOGLE_HEALTH_* env) — bounce back with an error flag.
    return Response.redirect(new URL('/settings?wearable=config', origin), 302)
  }
}
