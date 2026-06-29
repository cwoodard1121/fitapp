/**
 * DB access for wearable connections + imported recovery metrics. Functions take
 * a SupabaseClient so the SAME logic serves two callers: in-app reads/writes use
 * the user's RLS-scoped session client; the daily cron uses the service-role
 * client (no session). Either way every query is scoped by user_id explicitly.
 *
 * OAuth tokens are encrypted/decrypted HERE so callers always deal in plaintext.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  BodyMetric,
  NutritionLog,
  RecoveryMetric,
  Unit,
  WearableConnection,
  WearableStatus,
} from '@/lib/types'

import { decryptToken, encryptToken } from './crypto'
import type { DailyNutrition, DailyRecovery, TokenSet } from './google-health'

/** One day of body composition in the USER's unit (already converted). */
export interface DailyBodyRow {
  date: string
  bodyweight: number | null
  bodyFatPct: number | null
}

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

/** Last `days` recovery rows, oldest -> newest (for charts/trends). */
export async function getRecoveryRange(
  supabase: SupabaseClient,
  userId: string,
  days = 30,
): Promise<RecoveryMetric[]> {
  const { data, error } = await supabase
    .from('recovery_metrics')
    .select('*')
    .eq('user_id', userId)
    .order('metric_date', { ascending: false })
    .limit(days)
  if (error) throw new Error(error.message)
  return ((data as RecoveryMetric[]) ?? []).reverse()
}

/**
 * Upsert wearable-sourced daily nutrition INTAKE into nutrition_logs, MERGING
 * with existing rows: a wearable value wins when present (auto-fill), but never
 * overwrites a stored field with null — so manual entries and `notes` survive.
 * Only days carrying at least one value are written.
 */
export async function upsertNutritionDays(
  supabase: SupabaseClient,
  userId: string,
  days: DailyNutrition[],
): Promise<number> {
  const present = days.filter(
    (d) => d.calories != null || d.protein != null || d.carbs != null || d.fat != null,
  )
  if (present.length === 0) return 0

  const { data: existingRows, error: readError } = await supabase
    .from('nutrition_logs')
    .select('*')
    .eq('user_id', userId)
    .in('logged_on', present.map((d) => d.date))
  if (readError) throw new Error(readError.message)
  const existing = new Map(
    ((existingRows as NutritionLog[]) ?? []).map((r) => [r.logged_on, r]),
  )

  const rows = present.map((d) => {
    const e = existing.get(d.date)
    return {
      user_id: userId,
      logged_on: d.date,
      calories: keepOrPrev(d.calories, e?.calories),
      protein: keepOrPrev(d.protein, e?.protein),
      carbs: keepOrPrev(d.carbs, e?.carbs),
      fat: keepOrPrev(d.fat, e?.fat),
    }
  })
  const { error } = await supabase
    .from('nutrition_logs')
    .upsert(rows, { onConflict: 'user_id,logged_on' })
  if (error) throw new Error(error.message)
  return rows.length
}

/** The user's weight unit ('lb' default). Works with session OR service client. */
export async function getUserUnit(
  supabase: SupabaseClient,
  userId: string,
): Promise<Unit> {
  const { data, error } = await supabase
    .from('profiles')
    .select('unit')
    .eq('id', userId)
    .maybeSingle()
  // Throw on a real read error so the caller's body-import try/catch SKIPS the
  // day rather than silently guessing 'lb' and mis-converting a kg user's weight.
  if (error) throw new Error(error.message)
  return (data as { unit?: string } | null)?.unit === 'kg' ? 'kg' : 'lb'
}

/**
 * Upsert wearable-sourced daily weight + body-fat into body_metrics, MERGING
 * (wearable wins when present, never nulls out a stored value, preserves notes).
 * `bodyweight` must already be in the user's unit. Only days with a value write.
 */
export async function upsertBodyDays(
  supabase: SupabaseClient,
  userId: string,
  days: DailyBodyRow[],
): Promise<number> {
  const present = days.filter((d) => d.bodyweight != null || d.bodyFatPct != null)
  if (present.length === 0) return 0

  const { data: existingRows, error: readError } = await supabase
    .from('body_metrics')
    .select('*')
    .eq('user_id', userId)
    .in('measured_on', present.map((d) => d.date))
  if (readError) throw new Error(readError.message)
  const existing = new Map(
    ((existingRows as BodyMetric[]) ?? []).map((r) => [r.measured_on, r]),
  )

  const rows = present.map((d) => {
    const e = existing.get(d.date)
    return {
      user_id: userId,
      measured_on: d.date,
      bodyweight: keepOrPrev(d.bodyweight, e?.bodyweight),
      bodyfat_pct: keepOrPrev(d.bodyFatPct, e?.bodyfat_pct),
    }
  })
  const { error } = await supabase
    .from('body_metrics')
    .upsert(rows, { onConflict: 'user_id,measured_on' })
  if (error) throw new Error(error.message)
  return rows.length
}
