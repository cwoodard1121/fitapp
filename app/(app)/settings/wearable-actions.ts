'use server'

import { revalidatePath } from 'next/cache'

import { getAnalysisAccess } from '@/lib/ai/allowlist'
import { requireUserId } from '@/lib/data'
import { createClient } from '@/lib/supabase/server'
import { deleteConnection, getConnection, getRecentRecovery } from '@/lib/wearables/store'
import { syncUserWearable } from '@/lib/wearables/sync'

export type WearableActionResult =
  | { ok: true; daysWritten?: number }
  | { ok: false; error: string; reauthRequired?: boolean }

/** Disconnect the wearable (deletes stored tokens). Imported data is kept. */
export async function disconnectWearable(): Promise<WearableActionResult> {
  const { allowed } = await getAnalysisAccess()
  if (!allowed) return { ok: false, error: 'Wearable sync is not enabled for your account.' }

  const supabase = await createClient()
  const userId = await requireUserId(supabase)
  try {
    await deleteConnection(supabase, userId)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not disconnect.' }
  }
  revalidatePath('/settings')
  return { ok: true }
}

/** Run a sync immediately for the current user (manual "Sync now"). */
export async function syncWearableNow(): Promise<WearableActionResult> {
  const { allowed } = await getAnalysisAccess()
  if (!allowed) return { ok: false, error: 'Wearable sync is not enabled for your account.' }

  const supabase = await createClient()
  const userId = await requireUserId(supabase)
  const res = await syncUserWearable(supabase, userId)
  revalidatePath('/settings')

  if (res.ok) return { ok: true, daysWritten: res.daysWritten ?? 0 }
  return {
    ok: false,
    error: res.error ?? 'Sync failed.',
    reauthRequired: res.reauthRequired,
  }
}

/** Skip an auto-sync if the last one landed within this window (politeness + no point). */
const AUTO_SYNC_MIN_GAP_MS = 15 * 60 * 1000

/**
 * Background sync fired once per fresh app open (see WearableAutoSync). Silent
 * by design — no toast either way; the UI just refreshes if new days landed.
 * No-ops (never errors to the caller) when sync isn't applicable: not
 * allowlisted, nothing connected, or a connection that needs reauth (surfaced
 * instead in Settings, not nagged on every login).
 */
export async function autoSyncWearableIfDue(): Promise<WearableActionResult> {
  const { allowed } = await getAnalysisAccess()
  if (!allowed) return { ok: true, daysWritten: 0 }

  const supabase = await createClient()
  const userId = await requireUserId(supabase)
  const connection = await getConnection(supabase, userId)
  if (!connection || connection.status !== 'active') {
    return { ok: true, daysWritten: 0 }
  }

  // recovery_metrics.synced_at is the accurate "last sync" signal (the
  // connection's own updated_at only moves on a token refresh/status change,
  // per WearableConnect) — reuse it here to throttle the auto-sync.
  const [mostRecent] = await getRecentRecovery(supabase, userId, 1)
  if (mostRecent?.synced_at) {
    const sinceMs = Date.now() - new Date(mostRecent.synced_at).getTime()
    if (Number.isFinite(sinceMs) && sinceMs < AUTO_SYNC_MIN_GAP_MS) {
      return { ok: true, daysWritten: 0 }
    }
  }

  const res = await syncUserWearable(supabase, userId)
  revalidatePath('/today')
  revalidatePath('/overview')
  revalidatePath('/settings')
  return res.ok
    ? { ok: true, daysWritten: res.daysWritten ?? 0 }
    : { ok: false, error: res.error ?? 'Sync failed.', reauthRequired: res.reauthRequired }
}

/** One year matches the longest named trend range without making routine syncs heavier. */
const BACKFILL_DAYS = 365

/** Pull a wider window of history (steps/sleep/nutrition/weight/body-fat). */
export async function backfillWearableNow(): Promise<WearableActionResult> {
  const { allowed } = await getAnalysisAccess()
  if (!allowed) return { ok: false, error: 'Wearable sync is not enabled for your account.' }

  const supabase = await createClient()
  const userId = await requireUserId(supabase)
  const res = await syncUserWearable(supabase, userId, { lookbackDays: BACKFILL_DAYS })
  revalidatePath('/settings')

  if (res.ok) return { ok: true, daysWritten: res.daysWritten ?? 0 }
  return {
    ok: false,
    error: res.error ?? 'Import failed.',
    reauthRequired: res.reauthRequired,
  }
}
