/**
 * GET /api/wearables/google/callback — finish the Google Health OAuth flow.
 *
 * Verifies the CSRF state cookie, exchanges the code for tokens, resolves the
 * stable Google Health user id, stores the (encrypted) tokens against the
 * signed-in user, kicks off an immediate first sync, then redirects to Settings.
 */
import { cookies } from 'next/headers'

import { getAnalysisAccess } from '@/lib/ai/allowlist'
import { requireUserId } from '@/lib/data'
import { createClient } from '@/lib/supabase/server'
import {
  exchangeCode,
  getIdentity,
  OAUTH_STATE_COOKIE,
} from '@/lib/wearables/google-health'
import { saveTokens } from '@/lib/wearables/store'
import { syncUserWearable } from '@/lib/wearables/sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const origin = url.origin
  const settings = (status: string) =>
    Response.redirect(new URL(`/settings?wearable=${status}`, origin), 302)

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const oauthError = url.searchParams.get('error')

  const cookieStore = await cookies()
  const expected = cookieStore.get(OAUTH_STATE_COOKIE)?.value
  cookieStore.delete(OAUTH_STATE_COOKIE)

  // User declined consent, or a CSRF/state mismatch.
  if (oauthError) return settings('denied')
  if (!code || !state || !expected || state !== expected) return settings('error')

  const { allowed } = await getAnalysisAccess()
  if (!allowed) {
    return new Response('Wearable sync is not enabled for your account.', { status: 403 })
  }

  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)

    const tokens = await exchangeCode(code)
    const ghUserId = await getIdentity(tokens.accessToken)
    await saveTokens(supabase, userId, tokens, {
      googleHealthUserId: ghUserId,
      scopes: tokens.scope ? tokens.scope.split(' ') : null,
    })

    // Best-effort immediate backfill so the UI shows data right away.
    await syncUserWearable(supabase, userId).catch(() => {})

    return settings('connected')
  } catch (e) {
    console.error('wearable callback failed', e)
    return settings('error')
  }
}
