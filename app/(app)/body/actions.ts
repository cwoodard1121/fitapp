'use server'

import { endOfISOWeek, format, parseISO, startOfISOWeek } from 'date-fns'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { requireUserId } from '@/lib/data'
import { calculateNavyBodyFatPct } from '@/lib/body/body-fat'
import type { BaselineLift, BodyMetric } from '@/lib/types'

export type ActionResult =
  | { ok: true; metric: BodyMetric }
  | { ok: false; error: string }

export type BaselineLiftActionResult =
  | { ok: true; lift: BaselineLift }
  | { ok: false; error: string }

export type PreferenceActionResult = { ok: true } | { ok: false; error: string }

const ROUTE = '/body'

/** yyyy-MM-dd */
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid date.')

const upsertSchema = z.object({
  measured_on: dateSchema,
  // Bodyweight is required for a weigh-in; keep a sane upper bound.
  bodyweight: z
    .number({ invalid_type_error: 'Enter your weight.' })
    .positive('Weight must be greater than zero.')
    .max(2000, "That weight doesn't look right."),
  bodyfat_pct: z
    .number()
    .min(1, 'Body fat must be at least 1%.')
    .max(75, 'Body fat must be under 75%.')
    .nullable()
    .optional(),
  height_cm: z.number().min(100).max(250).nullable().optional(),
  neck_cm: z.number().min(15).max(100).nullable().optional(),
  waist_cm: z.number().min(30).max(250).nullable().optional(),
  notes: z.string().trim().max(500, 'Keep notes under 500 characters.').nullable().optional(),
}).superRefine((value, ctx) => {
  const tape = [value.height_cm, value.neck_cm, value.waist_cm]
  const supplied = tape.filter((measurement) => measurement != null).length
  if (supplied !== 0 && supplied !== tape.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['neck_cm'],
      message: 'Enter height, neck, and waist together for the weekly Navy measurement.',
    })
  }
  if (
    value.neck_cm != null &&
    value.waist_cm != null &&
    value.waist_cm <= value.neck_cm
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['waist_cm'],
      message: 'Waist must be larger than neck for the Navy calculation.',
    })
  }
})

const navyMeasurementSchema = z
  .object({
    measured_on: dateSchema,
    height_cm: z.number().min(100).max(250),
    neck_cm: z.number().min(15).max(100),
    waist_cm: z.number().min(30).max(250),
  })
  .superRefine((value, ctx) => {
    if (value.waist_cm <= value.neck_cm) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['waist_cm'],
        message: 'Waist must be larger than neck for the Navy calculation.',
      })
    }
  })

const baselineLiftSchema = z.object({
  lift_kind: z.enum(['bench', 'squat', 'deadlift', 'press']),
  exercise_name: z.string().trim().min(1, 'Name the lift.').max(80, 'Keep the lift name short.'),
  e1rm: z
    .number({ invalid_type_error: 'Enter an estimated 1RM.' })
    .positive('Estimated 1RM must be greater than zero.')
    .max(3000, "That lift doesn't look right."),
  lifted_on: dateSchema.nullable().optional(),
})

export type UpsertBodyMetricInput = z.input<typeof upsertSchema>
export type UpsertNavyMeasurementInput = z.input<typeof navyMeasurementSchema>
export type UpsertBaselineLiftInput = z.input<typeof baselineLiftSchema>

/**
 * Add or update a weigh-in. Upserts on (user_id, measured_on) so logging
 * twice in one day overwrites rather than duplicates.
 */
export async function upsertBodyMetric(
  input: UpsertBodyMetricInput,
): Promise<ActionResult> {
  const parsed = upsertSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid entry.' }
  }
  const { measured_on, bodyweight, bodyfat_pct, height_cm, neck_cm, waist_cm, notes } =
    parsed.data

  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)
    const hasTape = height_cm != null && neck_cm != null && waist_cm != null
    const navy_bodyfat_pct = hasTape
      ? calculateNavyBodyFatPct({
          heightCm: height_cm,
          neckCm: neck_cm,
          waistCm: waist_cm,
        })
      : null

    if (hasTape && navy_bodyfat_pct == null) {
      return {
        ok: false,
        error: "Those tape measurements don't produce a valid Navy body-fat estimate.",
      }
    }

    if (hasTape) {
      const measuredDate = parseISO(measured_on)
      const weekStart = format(startOfISOWeek(measuredDate), 'yyyy-MM-dd')
      const weekEnd = format(endOfISOWeek(measuredDate), 'yyyy-MM-dd')
      const { data: weeklyRows, error: weeklyError } = await supabase
        .from('body_metrics')
        .select('measured_on,navy_bodyfat_pct')
        .eq('user_id', userId)
        .gte('measured_on', weekStart)
        .lte('measured_on', weekEnd)
        .not('navy_bodyfat_pct', 'is', null)

      if (weeklyError) return { ok: false, error: weeklyError.message }
      const existingWeekly = weeklyRows?.find((row) => row.measured_on !== measured_on)
      if (existingWeekly) {
        return {
          ok: false,
          error: `Navy measurements are weekly. This week is already logged on ${existingWeekly.measured_on}.`,
        }
      }
    }

    const { data, error } = await supabase
      .from('body_metrics')
      .upsert(
        {
          user_id: userId,
          measured_on,
          bodyweight,
          // Keep the legacy column mirrored during the rollout.
          bodyfat_pct: bodyfat_pct ?? null,
          bia_bodyfat_pct: bodyfat_pct ?? null,
          height_cm: hasTape ? height_cm : null,
          neck_cm: hasTape ? neck_cm : null,
          waist_cm: hasTape ? waist_cm : null,
          navy_bodyfat_pct,
          notes: notes && notes.length > 0 ? notes : null,
          // A manual weigh-in always wins over the wearable sync.
          source: 'manual',
        },
        { onConflict: 'user_id,measured_on' },
      )
      .select('*')
      .single()

    if (error) return { ok: false, error: error.message }
    revalidatePath(ROUTE)
    revalidatePath('/goals')
    revalidatePath('/progress')
    revalidatePath('/overview')
    revalidatePath('/today')
    return { ok: true, metric: data as BodyMetric }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not save the weigh-in.',
    }
  }
}

/**
 * Add the weekly Navy tape without requiring or replacing a weigh-in. When a
 * body-metric row already exists for the date, its weight, BIA, notes, and
 * source are carried forward unchanged.
 */
export async function upsertNavyMeasurement(
  input: UpsertNavyMeasurementInput,
): Promise<ActionResult> {
  const parsed = navyMeasurementSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid measurement.' }
  }
  const { measured_on, height_cm, neck_cm, waist_cm } = parsed.data
  const navy_bodyfat_pct = calculateNavyBodyFatPct({
    heightCm: height_cm,
    neckCm: neck_cm,
    waistCm: waist_cm,
  })
  if (navy_bodyfat_pct == null) {
    return {
      ok: false,
      error: "Those tape measurements don't produce a valid Navy body-fat estimate.",
    }
  }

  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)
    const measuredDate = parseISO(measured_on)
    const weekStart = format(startOfISOWeek(measuredDate), 'yyyy-MM-dd')
    const weekEnd = format(endOfISOWeek(measuredDate), 'yyyy-MM-dd')

    const { data: weeklyRows, error: weeklyError } = await supabase
      .from('body_metrics')
      .select('measured_on,navy_bodyfat_pct')
      .eq('user_id', userId)
      .gte('measured_on', weekStart)
      .lte('measured_on', weekEnd)
      .not('navy_bodyfat_pct', 'is', null)

    if (weeklyError) return { ok: false, error: weeklyError.message }
    const existingWeekly = weeklyRows?.find((row) => row.measured_on !== measured_on)
    if (existingWeekly) {
      return {
        ok: false,
        error: `Navy measurements are weekly. This week is already logged on ${existingWeekly.measured_on}.`,
      }
    }

    const { data: existingRow, error: existingError } = await supabase
      .from('body_metrics')
      .select('*')
      .eq('user_id', userId)
      .eq('measured_on', measured_on)
      .maybeSingle()

    if (existingError) return { ok: false, error: existingError.message }
    const existing = existingRow as BodyMetric | null

    const { data, error } = await supabase
      .from('body_metrics')
      .upsert(
        {
          user_id: userId,
          measured_on,
          bodyweight: existing?.bodyweight ?? null,
          bodyfat_pct: existing?.bodyfat_pct ?? null,
          bia_bodyfat_pct:
            existing?.bia_bodyfat_pct ?? existing?.bodyfat_pct ?? null,
          height_cm,
          neck_cm,
          waist_cm,
          navy_bodyfat_pct,
          notes: existing?.notes ?? null,
          source: existing?.source ?? 'manual',
        },
        { onConflict: 'user_id,measured_on' },
      )
      .select('*')
      .single()

    if (error) return { ok: false, error: error.message }
    revalidatePath(ROUTE)
    revalidatePath('/goals')
    revalidatePath('/progress')
    revalidatePath('/overview')
    revalidatePath('/today')
    return { ok: true, metric: data as BodyMetric }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not save the weekly tape.',
    }
  }
}

/** Delete a weigh-in by id (RLS scopes this to the current user). */
export async function deleteBodyMetric(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: 'Missing entry.' }
  try {
    const supabase = await createClient()
    await requireUserId(supabase)

    const { error } = await supabase.from('body_metrics').delete().eq('id', id)
    if (error) return { ok: false, error: error.message }
    revalidatePath(ROUTE)
    revalidatePath('/goals')
    revalidatePath('/progress')
    revalidatePath('/overview')
    revalidatePath('/today')
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not delete the weigh-in.',
    }
  }
}

/** Persist whether strength may make a small, capped body-fat adjustment. */
export async function setBodyFatLiftCompensation(
  enabled: boolean,
): Promise<PreferenceActionResult> {
  if (typeof enabled !== 'boolean') {
    return { ok: false, error: 'Invalid lift compensation setting.' }
  }

  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)
    const { error } = await supabase
      .from('profiles')
      .update({ bodyfat_lift_compensation: enabled })
      .eq('id', userId)

    if (error) return { ok: false, error: error.message }
    revalidatePath(ROUTE)
    revalidatePath('/progress')
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not save lift compensation setting.',
    }
  }
}

/** Add or update a manual baseline lift for body-fat estimate calibration. */
export async function upsertBaselineLift(
  input: UpsertBaselineLiftInput,
): Promise<BaselineLiftActionResult> {
  const parsed = baselineLiftSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid lift.' }
  }
  const { lift_kind, exercise_name, e1rm, lifted_on } = parsed.data

  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)

    const { data, error } = await supabase
      .from('baseline_lifts')
      .upsert(
        {
          user_id: userId,
          lift_kind,
          exercise_name,
          e1rm,
          lifted_on: lifted_on ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,lift_kind' },
      )
      .select('*')
      .single()

    if (error) return { ok: false, error: error.message }
    revalidatePath(ROUTE)
    revalidatePath('/progress')
    return { ok: true, lift: data as BaselineLift }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not save the baseline lift.',
    }
  }
}

/** Delete a manual baseline lift by id (RLS scopes this to the current user). */
export async function deleteBaselineLift(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: 'Missing baseline lift.' }
  try {
    const supabase = await createClient()
    await requireUserId(supabase)

    const { error } = await supabase.from('baseline_lifts').delete().eq('id', id)
    if (error) return { ok: false, error: error.message }
    revalidatePath(ROUTE)
    revalidatePath('/progress')
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not delete the baseline lift.',
    }
  }
}
