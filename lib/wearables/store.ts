/**
 * DB access for wearable connections + imported recovery metrics. Functions take
 * a SupabaseClient so the SAME logic serves two callers: in-app reads/writes use
 * the user's RLS-scoped session client; the daily cron uses the service-role
 * client (no session). Either way every query is scoped by user_id explicitly.
 *
 * OAuth tokens are encrypted/decrypted HERE so callers always deal in plaintext.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import type { RecoveryMetric, WearableConnection, WearableStatus } from '@/lib/types'

import { decryptToken, encryptToken } from './crypto'
import type { DailyRecovery, TokenSet } from './google-health'

const PROVIDER = 'google_health'

export async function getConnection(
  supabase: SupabaseClient,
  userId: string,
): Promise<WearableConnection | null> {
  const { data, error } = await supabase
    .from('wearable_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', PROVIDER)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as WearableConnection | null) ?? null
}

/** Every user_id with a connected provider — the cron's work list. */
export async function listConnectedUserIds(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase
    .from('wearable_connections')
    .select('user_id')
    .eq('provider', PROVIDER)
  if (error) throw new Error(error.message)
  return ((data as { user_id: string }[]) ?? []).map((r) => r.user_id)
}

/** Decrypt the stored tokens; a corrupt value decodes to null (forces reauth). */
export function decryptConnectionTokens(row: WearableConnection): {
  accessToken: string | null
  refreshToken: string | null
} {
  const safe = (v: string | null) => {
    if (!v) return null
    try {
      return decryptToken(v)
    } catch {
      return null
    }
  }
  return { accessToken: safe(row.access_token), refreshToken: safe(row.refresh_token) }
}

/**
 * Upsert tokens (encrypted) for the user's connection. refresh_token is only
 * written when present, so a refresh response that omits it never clobbers the
 * stored one.
 */
export async function saveTokens(
  supabase: SupabaseClient,
  userId: string,
  tokens: TokenSet,
  opts?: { googleHealthUserId?: string | null; scopes?: string[] | null },
): Promise<void> {
  const payload: Record<string, unknown> = {
    user_id: userId,
    provider: PROVIDER,
    access_token: encryptToken(tokens.accessToken),
    token_expires_at: tokens.expiresAt,
    status: 'active',
    updated_at: new Date().toISOString(),
  }
  if (tokens.refreshToken) payload.refresh_token = encryptToken(tokens.refreshToken)
  if (opts?.googleHealthUserId !== undefined) {
    payload.google_health_user_id = opts.googleHealthUserId
  }
  if (opts?.scopes !== undefined) payload.scopes = opts.scopes

  const { error } = await supabase
    .from('wearable_connections')
    .upsert(payload, { onConflict: 'user_id,provider' })
  if (error) throw new Error(error.message)
}

export async function setConnectionStatus(
  supabase: SupabaseClient,
  userId: string,
  status: WearableStatus,
): Promise<void> {
  const { error } = await supabase
    .from('wearable_connections')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('provider', PROVIDER)
  if (error) throw new Error(error.message)
}

export async function deleteConnection(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('wearable_connections')
    .delete()
    .eq('user_id', userId)
    .eq('provider', PROVIDER)
  if (error) throw new Error(error.message)
}

/** Keep the incoming value, else fall back to the previously stored one. */
function keepOrPrev(next: number | null, prev: number | null | undefined): number | null {
  return next != null ? next : prev ?? null
}

/**
 * Upsert a window of daily recovery rows (idempotent on user_id + metric_date).
 *
 * MERGES against existing rows: a null in the incoming day (e.g. a transient
 * HR/HRV fetch miss, which is best-effort and returns nothing) must NOT clobber
 * a value a previous sync already stored — once a date leaves the short lookback
 * window it is never re-pulled, so a blind null-write would be permanent loss.
 */
export async function upsertRecoveryDays(
  supabase: SupabaseClient,
  userId: string,
  days: DailyRecovery[],
): Promise<number> {
  if (days.length === 0) return 0
  const now = new Date().toISOString()

  const { data: existingRows, error: readError } = await supabase
    .from('recovery_metrics')
    .select('*')
    .eq('user_id', userId)
    .in('metric_date', days.map((d) => d.date))
  if (readError) throw new Error(readError.message)
  const existing = new Map(
    ((existingRows as RecoveryMetric[]) ?? []).map((r) => [r.metric_date, r]),
  )

  const rows = days.map((d) => {
    const e = existing.get(d.date)
    return {
      user_id: userId,
      metric_date: d.date,
      steps: keepOrPrev(d.steps, e?.steps),
      sleep_minutes_asleep: keepOrPrev(d.sleepMinutesAsleep, e?.sleep_minutes_asleep),
      sleep_minutes_in_period: keepOrPrev(d.sleepMinutesInPeriod, e?.sleep_minutes_in_period),
      sleep_light_min: keepOrPrev(d.sleepLightMin, e?.sleep_light_min),
      sleep_deep_min: keepOrPrev(d.sleepDeepMin, e?.sleep_deep_min),
      sleep_rem_min: keepOrPrev(d.sleepRemMin, e?.sleep_rem_min),
      sleep_awake_min: keepOrPrev(d.sleepAwakeMin, e?.sleep_awake_min),
      resting_hr: keepOrPrev(d.restingHr, e?.resting_hr),
      hrv_ms: keepOrPrev(d.hrvMs, e?.hrv_ms),
      source: PROVIDER,
      synced_at: now,
    }
  })
  const { error } = await supabase
    .from('recovery_metrics')
    .upsert(rows, { onConflict: 'user_id,metric_date' })
  if (error) throw new Error(error.message)
  return rows.length
}

/** Most recent recovery rows for the user, newest first. */
export async function getRecentRecovery(
  supabase: SupabaseClient,
  userId: string,
  limit = 14,
): Promise<RecoveryMetric[]> {
  const { data, error } = await supabase
    .from('recovery_metrics')
    .select('*')
    .eq('user_id', userId)
    .order('metric_date', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data as RecoveryMetric[]) ?? []
}
