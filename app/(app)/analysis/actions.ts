'use server'

import { revalidatePath } from 'next/cache'

import { getAnalysisAccess } from '@/lib/ai/allowlist'
import { generateAndStoreAnalysis } from '@/lib/ai/analysis'
import { createClient } from '@/lib/supabase/server'
import { requireUserId } from '@/lib/data'

export type AnalysisActionResult = { ok: true } | { ok: false; error: string }

/** Don't let the paid generation be hammered — one refresh per this window. */
const REFRESH_COOLDOWN_MS = 30_000

/**
 * Generate a fresh AI training overview for the current (allowlisted) user and
 * cache it. Revalidates the screens that read the cached analysis.
 */
export async function generateAnalysisAction(): Promise<AnalysisActionResult> {
  const { allowed } = await getAnalysisAccess()
  if (!allowed) {
    return { ok: false, error: 'Analysis is not enabled for your account.' }
  }

  // Cooldown: refuse if the newest analysis is younger than the window so a
  // rapid double-click can't trigger back-to-back paid OpenAI calls.
  const supabase = await createClient()
  const userId = await requireUserId(supabase)
  const { data: latest } = await supabase
    .from('ai_analyses')
    .select('created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latest?.created_at) {
    const age = new Date().getTime() - new Date(latest.created_at).getTime()
    if (age < REFRESH_COOLDOWN_MS) {
      return {
        ok: false,
        error: 'Just refreshed — give it a few seconds before regenerating.',
      }
    }
  }

  try {
    await generateAndStoreAnalysis()
  } catch (e) {
    console.error('generateAnalysisAction failed', e)
    const msg = e instanceof Error ? e.message : ''
    // Only allowlisted accounts reach here, so a specific reason is safe and
    // makes config/runtime problems self-diagnosable instead of a dead end.
    if (/OPENAI_API_KEY is not set/i.test(msg)) {
      return {
        ok: false,
        error:
          'AI isn’t configured on the server yet (OPENAI_API_KEY missing). If you just added it in Vercel, redeploy so the running build picks it up.',
      }
    }
    return {
      ok: false,
      error: `Could not generate the overview: ${msg ? msg.slice(0, 240) : 'unknown error'}`,
    }
  }

  revalidatePath('/progress')
  revalidatePath('/today')
  revalidatePath('/goals')
  return { ok: true }
}
