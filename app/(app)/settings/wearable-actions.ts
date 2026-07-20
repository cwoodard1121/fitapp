'use server'

import { revalidatePath } from 'next/cache'

import { getAnalysisAccess } from '@/lib/ai/allowlist'
import { requireUserId } from '@/lib/data'
import { createClient } from '@/lib/supabase/server'
import { deleteConnection } from '@/lib/wearables/store'
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
