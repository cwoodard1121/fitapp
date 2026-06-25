/**
 * AI training overview: gather a compact summary of the user's training, ask
 * the LLM for a structured overview, validate it, and cache it.
 *
 * Server-only. The cached AnalysisPayload feeds several screens (Progress,
 * Goals, a Today focus nudge), so it is deliberately lightweight and structured
 * rather than a chat transcript.
 */
import { z } from 'zod'

import type {
  AiAnalysis,
  AnalysisPayload,
  Block,
  BodyMetric,
  ExerciseSlot,
  Goal,
  NutritionLog,
  SetLog,
} from '@/lib/types'
import {
  getActiveProgram,
  getProfile,
  getProgramFull,
  requireUserId,
  slotConfigFromRow,
  setLogInputFromRow,
  derivePrevTargets,
  weekForDate,
} from '@/lib/data'
import { evaluateSlot, detectStall, epley1RM } from '@/lib/engine/engine'
import { computeProgress } from '@/components/goals/progress'
import { getAnalysisAccess } from '@/lib/ai/allowlist'
import { createClient } from '@/lib/supabase/server'

import { callOpenAIJson } from './openai'

/* ------------------------------------------------------------------ */
/* Schema — EXACTLY mirrors AnalysisPayload                            */
/* ------------------------------------------------------------------ */

/** Coerce anything to a string, defaulting to ''. */
const str = z.preprocess((v) => (typeof v === 'string' ? v : ''), z.string())

/** Coerce to a string array, dropping non-strings and clamping to <= 6 items. */
const strList = z.preprocess(
  (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []),
  z.array(z.string()).transform((a) => a.slice(0, 6)),
)

export const analysisSchema = z.object({
  headline: str,
  overview: str,
  training: z.object({
    summary: str,
    strong_areas: strList,
    lagging_areas: strList,
  }),
  goals: z.object({
    summary: str,
    on_track: strList,
    at_risk: strList,
  }),
  body: z.object({ summary: str }),
  nutrition: z.object({ summary: str }),
  focus: strList,
})

/* ------------------------------------------------------------------ */
/* Input gathering — a compact plain-text training summary             */
/* ------------------------------------------------------------------ */

const MAX_INPUT_CHARS = 4000

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * Build a COMPACT plain-text summary of the user's training for the LLM. Mirrors
 * the Progress page: runs the engine over set_logs grouped by exercise in week
 * order to get each lift's latest e1RM, trend, last decision, and any stall.
 * Adds goals (with computed progress %), recent body metrics, and nutrition vs
 * the active diet block. Summarized — never raw rows — and capped in length.
 */
export async function gatherAnalysisInput(): Promise<string> {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)

  const profile = await getProfile()
  const unit = profile?.unit ?? 'lb'
  const lines: string[] = []

  /* --- Program + current week --- */
  const program = await getActiveProgram()
  if (!program) {
    lines.push('No active program set up yet.')
  } else {
    const week = weekForDate(program.start_date, program.length_weeks)
    lines.push(
      `Program: ${program.name} (week ${week} of ${program.length_weeks}, deload week ${program.deload_week}).`,
    )
  }

  /* --- Per-lift engine readout --- */
  if (program) {
    const full = await getProgramFull(program.id)
    const slots = full?.slots ?? []
    const slotById = new Map<string, ExerciseSlot>(slots.map((s) => [s.id, s]))

    const { data: logRows } = await supabase
      .from('set_logs')
      .select('*')
      .eq('user_id', userId)
      .order('week', { ascending: true })
      .order('created_at', { ascending: true })
    const logs = (logRows as SetLog[]) ?? []
    const deloadWeek = program.deload_week

    // Group by exercise_name, run the engine in sequence (mirror Progress page).
    const groups = new Map<string, { slot: ExerciseSlot; logs: SetLog[] }>()
    for (const log of logs) {
      const slot = slotById.get(log.slot_id)
      if (!slot) continue
      const g = groups.get(slot.exercise_name)
      if (g) g.logs.push(log)
      else groups.set(slot.exercise_name, { slot, logs: [log] })
    }

    type LiftRow = {
      name: string
      area: string | null
      latestE1rm: number | null
      firstE1rm: number | null
      decision: string
      stalled: boolean
      logCount: number
    }
    const liftRows: LiftRow[] = []

    for (const [name, { slot, logs: groupLogs }] of groups) {
      const config = slotConfigFromRow(slot)
      const e1rms: number[] = []
      const samples: { e1rm: number | null; decision: ReturnType<typeof evaluateSlot>['decision'] }[] = []
      let prevLog: SetLog | null = null
      let lastDecision = '—'

      for (const log of groupLogs) {
        const prev = derivePrevTargets(config, prevLog, log.week - 1, deloadWeek)
        const result = evaluateSlot(setLogInputFromRow(log), config, {
          week: log.week,
          deloadWeek,
          prevNextLoad: prev.prevNextLoad,
          prevNextSets: prev.prevNextSets,
          prevNextReps: prev.prevNextReps,
        })
        if (result.e1rm != null) e1rms.push(result.e1rm)
        samples.push({ e1rm: result.e1rm, decision: result.decision })
        lastDecision = result.decisionLabel
        prevLog = log
      }

      const { stalled } = detectStall(samples)
      liftRows.push({
        name,
        area: slot.muscle_area,
        latestE1rm: e1rms.length ? e1rms[e1rms.length - 1] : null,
        firstE1rm: e1rms.length ? e1rms[0] : null,
        decision: lastDecision,
        stalled,
        logCount: groupLogs.length,
      })
    }

    if (liftRows.length === 0) {
      lines.push('No sessions logged yet.')
    } else {
      liftRows.sort((a, b) => b.logCount - a.logCount || a.name.localeCompare(b.name))
      lines.push('Lifts:')
      for (const l of liftRows) {
        const trend =
          l.latestE1rm != null && l.firstE1rm != null
            ? `e1RM ${round1(l.latestE1rm)}${unit} (${l.latestE1rm >= l.firstE1rm ? '+' : ''}${round1(l.latestE1rm - l.firstE1rm)} since start)`
            : 'no e1RM yet'
        const area = l.area ? ` [${l.area}]` : ''
        const stall = l.stalled ? ', STALLED' : ''
        lines.push(`- ${l.name}${area}: ${trend}, last call "${l.decision}"${stall}`)
      }
    }
  }

  /* --- Goals with computed progress % --- */
  const { data: goalRows } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
  const goals = (goalRows as Goal[]) ?? []
  if (goals.length > 0) {
    lines.push('Goals:')
    for (const g of goals) {
      const current = await deriveGoalCurrent(supabase, userId, g)
      const prog = computeProgress(g.start_value, current, g.target_value)
      const pct = prog ? `${Math.round(prog.pct)}% there` : 'progress unknown'
      const target =
        g.target_value != null
          ? ` (target ${g.target_value}${g.target_unit ? g.target_unit : ''}${g.target_date ? ` by ${g.target_date.slice(0, 10)}` : ''})`
          : ''
      lines.push(`- ${g.title}: ${pct}${target}`)
    }
  }

  /* --- Recent body metrics (~6) --- */
  const { data: bodyRows } = await supabase
    .from('body_metrics')
    .select('*')
    .eq('user_id', userId)
    .order('measured_on', { ascending: false })
    .limit(6)
  const body = (bodyRows as BodyMetric[]) ?? []
  if (body.length > 0) {
    const oldest = body[body.length - 1]
    const newest = body[0]
    const bw =
      newest.bodyweight != null
        ? `bodyweight ${newest.bodyweight}${unit}${
            oldest.bodyweight != null && oldest !== newest
              ? ` (${newest.bodyweight >= oldest.bodyweight ? '+' : ''}${round1(newest.bodyweight - oldest.bodyweight)} over last ${body.length} readings)`
              : ''
          }`
        : null
    const bf = newest.bodyfat_pct != null ? `bodyfat ${newest.bodyfat_pct}%` : null
    const parts = [bw, bf].filter(Boolean)
    if (parts.length) lines.push(`Body: ${parts.join(', ')} (latest ${newest.measured_on.slice(0, 10)}).`)
  }

  /* --- Recent nutrition vs active diet block --- */
  const { data: blockRows } = await supabase
    .from('blocks')
    .select('*')
    .eq('user_id', userId)
    .eq('kind', 'diet')
    .eq('is_active', true)
    .order('start_date', { ascending: false })
    .limit(1)
  const activeBlock = (blockRows?.[0] as Block | undefined) ?? null

  const { data: nutritionRows } = await supabase
    .from('nutrition_logs')
    .select('*')
    .eq('user_id', userId)
    .order('logged_on', { ascending: false })
    .limit(7)
  const nutrition = (nutritionRows as NutritionLog[]) ?? []
  if (nutrition.length > 0) {
    const cals = nutrition.map((n) => n.calories).filter((v): v is number => v != null)
    const protein = nutrition.map((n) => n.protein).filter((v): v is number => v != null)
    const avgCals = cals.length ? Math.round(cals.reduce((a, b) => a + b, 0) / cals.length) : null
    const avgProtein = protein.length ? Math.round(protein.reduce((a, b) => a + b, 0) / protein.length) : null
    const parts: string[] = []
    if (avgCals != null) {
      parts.push(
        `avg ${avgCals} kcal/day over last ${nutrition.length}` +
          (activeBlock?.calorie_target != null ? ` (target ${activeBlock.calorie_target})` : ''),
      )
    }
    if (avgProtein != null) {
      parts.push(
        `avg ${avgProtein}g protein` +
          (activeBlock?.protein_target != null ? ` (target ${activeBlock.protein_target}g)` : ''),
      )
    }
    if (activeBlock) parts.push(`diet block "${activeBlock.name}"${activeBlock.phase ? ` (${activeBlock.phase})` : ''}`)
    if (parts.length) lines.push(`Nutrition: ${parts.join(', ')}.`)
  } else if (activeBlock) {
    lines.push(`Nutrition: diet block "${activeBlock.name}" active but no recent logs.`)
  }

  const text = lines.join('\n')
  return text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) : text
}

/** Live "current" value for a goal where derivable (mirrors the Goals page). */
async function deriveGoalCurrent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  goal: Goal,
): Promise<number | null> {
  switch (goal.metric_type) {
    case 'bodyweight':
    case 'bodyfat': {
      const { data } = await supabase
        .from('body_metrics')
        .select('bodyweight, bodyfat_pct')
        .eq('user_id', userId)
        .order('measured_on', { ascending: false })
        .limit(1)
        .maybeSingle()
      const row = data as { bodyweight: number | null; bodyfat_pct: number | null } | null
      return goal.metric_type === 'bodyweight' ? row?.bodyweight ?? null : row?.bodyfat_pct ?? null
    }
    case 'e1rm': {
      if (!goal.exercise_name) return null
      const { data } = await supabase
        .from('set_logs')
        .select('actual_load, best_reps, slot:exercise_slots!inner(exercise_name)')
        .eq('user_id', userId)
        .eq('slot.exercise_name', goal.exercise_name)
        .not('actual_load', 'is', null)
        .not('best_reps', 'is', null)
        .order('created_at', { ascending: false })
        .limit(60)
      let best: number | null = null
      for (const row of (data ?? []) as Array<{ actual_load: number | null; best_reps: number | null }>) {
        if (row.actual_load != null && row.best_reps != null) {
          const e = epley1RM(row.actual_load, row.best_reps)
          if (best == null || e > best) best = e
        }
      }
      return best == null ? null : round1(best)
    }
    default:
      return null
  }
}

/* ------------------------------------------------------------------ */
/* Generation + storage                                               */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You are a concise, no-nonsense strength coach. You are given a compact summary of one lifter's training, goals, bodyweight, and nutrition. Produce a LIGHTWEIGHT structured overview — not a chat reply.

Return ONLY a JSON object (no markdown, no prose outside the JSON) with EXACTLY this shape:
{
  "headline": string,            // one punchy line on where training stands now
  "overview": string,            // 2-4 sentence plain-language summary
  "training": {
    "summary": string,           // how the lifts are progressing overall
    "strong_areas": string[],    // lifts/muscle groups moving well (<= 6 short items)
    "lagging_areas": string[]    // lifts that stalled or lag (<= 6 short items)
  },
  "goals": {
    "summary": string,           // overall goal progress in a sentence
    "on_track": string[],        // goals on pace (<= 6 short items)
    "at_risk": string[]          // goals behind or stalled (<= 6 short items)
  },
  "body": { "summary": string },       // bodyweight / composition trend in a sentence
  "nutrition": { "summary": string },  // intake vs targets in a sentence
  "focus": string[]              // up to 3 concrete things to focus on next (short, actionable)
}

Keep every string short and scannable. If a section has no data, say so briefly and use empty arrays. Be specific to the numbers given; do not invent data.`

/**
 * Gather input, ask the LLM for the structured overview, validate it, store it
 * in ai_analyses, and return the payload.
 */
export async function generateAndStoreAnalysis(): Promise<AnalysisPayload> {
  // Defense-in-depth: the gate travels with the paid OpenAI call, not just the
  // action that fronts it.
  const { allowed } = await getAnalysisAccess()
  if (!allowed) throw new Error('Analysis is not enabled for this account.')

  const supabase = await createClient()
  const userId = await requireUserId(supabase)

  const input = await gatherAnalysisInput()
  const raw = await callOpenAIJson({
    system: SYSTEM_PROMPT,
    user: `Here is the training summary:\n\n${input}`,
  })

  const payload = analysisSchema.parse(raw)
  const model = process.env.OPENAI_ANALYSIS_MODEL || 'gpt-5.4'

  const { error } = await supabase
    .from('ai_analyses')
    .insert({ user_id: userId, model, payload })
  if (error) throw new Error(error.message)

  return payload
}

/** Newest cached analysis for the current user, or null. */
export async function getLatestAnalysis(): Promise<AiAnalysis | null> {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)

  const { data, error } = await supabase
    .from('ai_analyses')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  const row = (data as AiAnalysis | null) ?? null
  if (!row) return null

  // A legacy/malformed cached payload must not crash the pages that read it.
  const parsed = analysisSchema.safeParse(row.payload)
  if (!parsed.success) return null
  return { ...row, payload: parsed.data }
}
