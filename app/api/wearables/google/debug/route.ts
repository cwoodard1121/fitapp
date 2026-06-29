/**
 * GET /api/wearables/google/debug — TEMPORARY diagnostic. Allowlisted only.
 *
 * Shows which scopes were granted and the RAW Google Health dailyRollUp response
 * (status + body) for the data types we import, so we can see exactly why an
 * import is empty/failing (wrong field nesting, missing scope, no data, etc.).
 * Returns the owner's own data to the owner — safe. Remove once imports are solid.
 */
import { getAnalysisAccess } from '@/lib/ai/allowlist'
import { requireUserId } from '@/lib/data'
import { createClient } from '@/lib/supabase/server'
import { refreshAccessToken } from '@/lib/wearables/google-health'
import { decryptConnectionTokens, getConnection, saveTokens } from '@/lib/wearables/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEALTH_BASE = 'https://health.googleapis.com/v4'

function civil(d: Date) {
  return { date: { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() } }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text.slice(0, 1000)
  }
}

export async function GET(): Promise<Response> {
  const { allowed } = await getAnalysisAccess()
  if (!allowed) return new Response('Not enabled.', { status: 403 })

  const supabase = await createClient()
  const userId = await requireUserId(supabase)
  const conn = await getConnection(supabase, userId)
  if (!conn) return Response.json({ error: 'No wearable connected.' })

  const { accessToken, refreshToken } = decryptConnectionTokens(conn)
  let token = accessToken
  if (refreshToken) {
    try {
      const t = await refreshAccessToken(refreshToken)
      await saveTokens(supabase, userId, t)
      token = t.accessToken
    } catch (e) {
      return Response.json({
        scopes: conn.scopes,
        refreshError: e instanceof Error ? e.message : String(e),
      })
    }
  }
  if (!token) return Response.json({ scopes: conn.scopes, error: 'No access token.' })

  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  const body = JSON.stringify({ range: { start: civil(start), end: civil(end) }, windowSizeDays: 1 })

  async function rollup(dataType: string) {
    try {
      const res = await fetch(
        `${HEALTH_BASE}/users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body,
        },
      )
      return { status: res.status, body: safeParse(await res.text()) }
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }

  // `steps` is the known-good control; the rest are what's failing to import.
  const [steps, nutrition, weight, bodyFat] = await Promise.all([
    rollup('steps'),
    rollup('nutrition-log'),
    rollup('weight'),
    rollup('body-fat'),
  ])

  return Response.json(
    {
      grantedScopes: conn.scopes,
      window: { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) },
      steps,
      nutrition,
      weight,
      bodyFat,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
