/**
 * Shared wearable-sync logic, used by BOTH the daily Vercel Cron (service-role
 * client) and the in-app "Sync now" action (session client). Refreshes the
 * access token if needed, pulls a short trailing window of days (self-heals late
 * device syncs / missed runs), and upserts. A dead refresh token flips the
 * connection to 'reauth_required' so the UI can prompt a reconnect.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  fetchRecovery,
  refreshAccessToken,
  ReauthRequiredError,
} from './google-health'
import {
  decryptConnectionTokens,
  getConnection,
  saveTokens,
  setConnectionStatus,
  upsertRecoveryDays,
} from './store'

/** Refresh the access token this far before its expiry. */
const REFRESH_SKEW_MS = 5 * 60 * 1000
/** Re-pull this many trailing days each run (late sleep / missed runs self-heal). */
const LOOKBACK_DAYS = 3

export interface SyncResult {
  ok: boolean
  daysWritten?: number
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
    // A successful sync clears a prior reauth flag.
    if (conn.status !== 'active') {
      await setConnectionStatus(supabase, userId, 'active').catch(() => {})
    }
    return { ok: true, daysWritten: written }
  } catch (e) {
    if (e instanceof ReauthRequiredError) {
      await setConnectionStatus(supabase, userId, 'reauth_required').catch(() => {})
      return { ok: false, reauthRequired: true, error: 'Reconnect required (token expired).' }
    }
    return { ok: false, error: e instanceof Error ? e.message : 'Sync failed.' }
  }
}
