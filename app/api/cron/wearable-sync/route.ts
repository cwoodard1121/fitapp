/**
 * GET /api/cron/wearable-sync — batch wearable sync for every connected user.
 *
 * OPTIONAL / not scheduled by default. Syncing is normally manual ("Sync now" in
 * Settings, which runs as the user's own session). This route exists for anyone
 * who wants hands-off syncing via an external scheduler (e.g. cron-job.org)
 * hitting it with `Authorization: Bearer $CRON_SECRET`. There is NO user session
 * here, so it authenticates via CRON_SECRET and uses the SERVICE-ROLE client,
 * scoping every query by user_id. Each user's sync is isolated.
 */
import { createServiceClient } from '@/lib/supabase/service'
import { listConnectedUserIds } from '@/lib/wearables/store'
import { syncUserWearable } from '@/lib/wearables/sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// 60 is the Vercel Hobby cap; plenty for a single user's daily sync.
export const maxDuration = 60

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
