/**
 * Shared wearable-sync logic, used by BOTH the daily Vercel Cron (service-role
 * client) and the in-app "Sync now" action (session client). Refreshes the
 * access token if needed, pulls a short trailing window of days (self-heals late
 * device syncs / missed runs), and upserts. A dead refresh token flips the
 * connection to 'reauth_required' so the UI can prompt a reconnect.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  fetchBody,
  fetchNutrition,
  fetchRecovery,
  refreshAccessToken,
  ReauthRequiredError,
} from './google-health'
import {
  decryptConnectionTokens,
  getConnection,
  getUserUnit,
  saveTokens,
  setConnectionStatus,
  upsertBodyDays,
  upsertNutritionDays,
  upsertRecoveryDays,
  type DailyBodyRow,
} from './store'

/** Refresh the access token this far before its expiry. */
const REFRESH_SKEW_MS = 5 * 60 * 1000
/** Re-pull this many trailing days each run (late sleep / missed runs self-heal). */
const LOOKBACK_DAYS = 3
/** Body readings can lag; pull a slightly wider window. */
const BODY_LOOKBACK_DAYS = 7
const KG_TO_LB = 2.2046226218

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export interface SyncResult {
  ok: boolean
  daysWritten?: number
  nutritionDaysWritten?: number
  bodyDaysWritten?: number
  error?: string
  reauthRequired?: boolean
}

/** Sync one user's wearable. Never throws — returns a structured result. */
export async function syncUserWearable(
  supabase: SupabaseClient,
  userId: string,
): Promise<SyncResult> {
  const conn = await getConnection(supabase, userId).catch(() => null)
  if (!conn) return { ok: false, error: 'No wearable connected.' }

  const { accessToken, refreshToken } = decryptConnectionTokens(conn)
  if (!refreshToken) {
    await setConnectionStatus(supabase, userId, 'reauth_required').catch(() => {})
    return { ok: false, reauthRequired: true, error: 'Stored token unreadable — reconnect.' }
  }

  try {
    // Use the stored access token if it's still comfortably valid; else refresh.
    let token = accessToken
    const expMs = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0
    if (!token || Date.now() > expMs - REFRESH_SKEW_MS) {
      const refreshed = await refreshAccessToken(refreshToken)
      await saveTokens(supabase, userId, refreshed)
      token = refreshed.accessToken
    }

    const days = await fetchRecovery(token, LOOKBACK_DAYS)
    const written = await upsertRecoveryDays(supabase, userId, days)

    // Best-effort extras — a failure here (e.g. a scope not yet granted, or no
    // readings) must NOT fail the core steps/sleep sync.
    let nutritionDaysWritten = 0
    try {
      const nutrition = await fetchNutrition(token, LOOKBACK_DAYS)
      nutritionDaysWritten = await upsertNutritionDays(supabase, userId, nutrition)
    } catch (e) {
      console.error('nutrition import skipped:', e instanceof Error ? e.message : e)
    }

    let bodyDaysWritten = 0
    try {
      const unit = await getUserUnit(supabase, userId)
      const body = await fetchBody(token, BODY_LOOKBACK_DAYS)
      const converted: DailyBodyRow[] = body.map((d) => ({
        date: d.date,
        bodyweight:
          d.weightKg == null
            ? null
            : round1(unit === 'lb' ? d.weightKg * KG_TO_LB : d.weightKg),
        bodyFatPct: d.bodyFatPct == null ? null : round1(d.bodyFatPct),
      }))
      bodyDaysWritten = await upsertBodyDays(supabase, userId, converted)
    } catch (e) {
      console.error('body import skipped:', e instanceof Error ? e.message : e)
    }

    // A successful sync clears a prior reauth flag.
    if (conn.status !== 'active') {
      await setConnectionStatus(supabase, userId, 'active').catch(() => {})
    }
    return { ok: true, daysWritten: written, nutritionDaysWritten, bodyDaysWritten }
  } catch (e) {
    if (e instanceof ReauthRequiredError) {
      await setConnectionStatus(supabase, userId, 'reauth_required').catch(() => {})
      return { ok: false, reauthRequired: true, error: 'Reconnect required (token expired).' }
    }
    return { ok: false, error: e instanceof Error ? e.message : 'Sync failed.' }
  }
}
