/**
 * GET /api/cron/wearable-sync — daily wearable sync for every connected user.
 *
 * Invoked by Vercel Cron (see vercel.json). There is NO user session here, so it
 * authenticates the invocation via CRON_SECRET (Vercel sends it as a Bearer
 * token) and uses the SERVICE-ROLE Supabase client, scoping every query by
 * user_id. Each user's sync is isolated — one failure doesn't abort the rest.
 */
import { createServiceClient } from '@/lib/supabase/service'
import { listConnectedUserIds } from '@/lib/wearables/store'
import { syncUserWearable } from '@/lib/wearables/sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return Response.json(
      { error: 'CRON_SECRET is not set — refusing to run an unprotected cron.' },
      { status: 503 },
    )
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  let supabase
  try {
    supabase = createServiceClient()
  } catch (e) {
    console.error('cron: service client unavailable', e)
    return Response.json(
      { error: e instanceof Error ? e.message : 'service client unavailable' },
      { status: 503 },
    )
  }

  const userIds = await listConnectedUserIds(supabase)
  const results: Array<{ userId: string; ok: boolean; daysWritten?: number; error?: string }> = []
  for (const userId of userIds) {
    const r = await syncUserWearable(supabase, userId)
    results.push({ userId, ok: r.ok, daysWritten: r.daysWritten, error: r.error })
  }

  const synced = results.filter((r) => r.ok).length
  return Response.json({ connected: userIds.length, synced, results })
}
