"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { requireUserId, getActiveProgram, setProgramStartDate } from "@/lib/data"
import { resetMaintenanceCalibration } from "@/app/(app)/nutrition/actions"
import type { Block, BlockKind } from "@/lib/types"

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

const trainingPhases = ["hypertrophy", "strength", "peak", "maintain"] as const
const dietPhases = ["cut", "bulk", "recomp", "maintain"] as const

const emptyToNull = (v: unknown) =>
  v === "" || v === undefined ? null : v

const numberish = z.preprocess(
  emptyToNull,
  z.coerce.number().finite().nonnegative().nullable(),
)

const dateish = z.preprocess(
  emptyToNull,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date")
    .nullable(),
)

const baseSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(["training", "diet"]),
  name: z.string().trim().min(1, "Name is required").max(120),
  goal: z.preprocess(emptyToNull, z.string().trim().max(280).nullable()),
  phase: z.preprocess(emptyToNull, z.string().nullable()),
  start_date: dateish,
  end_date: dateish,
  length_weeks: z.preprocess(
    emptyToNull,
    z.coerce.number().int().min(1).max(104).nullable(),
  ),
  program_id: z.preprocess(emptyToNull, z.string().uuid().nullable()),
  calorie_target: numberish,
  protein_target: numberish,
  carb_target: numberish,
  fat_target: numberish,
  notes: z.preprocess(emptyToNull, z.string().trim().max(2000).nullable()),
  is_active: z.coerce.boolean().default(false),
})

export type BlockFormInput = z.input<typeof baseSchema>

/** A block that got paused because a different block was just made active. */
export interface DeactivatedBlock {
  id: string
  kind: BlockKind
  name: string
}

export type ActionResult =
  | { ok: true; id: string; deactivated?: DeactivatedBlock[] }
  | { ok: false; error: string }

export type RestartResult =
  | {
      ok: true
      programRestarted: boolean
      trainingBlockRestarted: boolean
      dietBlockRestarted: boolean
    }
  | { ok: false; error: string }

export type CompleteBlockResult =
  | { ok: true; id: string; completedAt: string; endDate: string }
  | { ok: false; error: string }

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Deactivate every other active block for this user, regardless of kind — only
 * one block runs at a time. Returns what got paused so the caller can tell the
 * athlete what just happened.
 */
async function deactivateOthers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  exceptId?: string,
): Promise<DeactivatedBlock[]> {
  let readQ = supabase
    .from("blocks")
    .select("id, kind, name")
    .eq("user_id", userId)
    .eq("is_active", true)
  if (exceptId) readQ = readQ.neq("id", exceptId)
  const { data: others, error: readErr } = await readQ
  if (readErr) throw readErr

  const rows = (others ?? []) as DeactivatedBlock[]
  if (rows.length === 0) return []

  const { error } = await supabase
    .from("blocks")
    .update({ is_active: false })
    .in("id", rows.map((r) => r.id))
  if (error) throw error

  return rows
}

function normalizePhase(kind: BlockKind, phase: string | null): string | null {
  if (!phase) return null
  const valid =
    kind === "training"
      ? (trainingPhases as readonly string[])
      : (dietPhases as readonly string[])
  return valid.includes(phase) ? phase : null
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

export async function saveBlock(input: BlockFormInput): Promise<ActionResult> {
  const parsed = baseSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the form and try again.",
    }
  }
  const v = parsed.data

  if (
    v.is_active &&
    v.end_date != null &&
    v.end_date < new Date().toISOString().slice(0, 10)
  ) {
    return {
      ok: false,
      error: "A block whose end date has passed cannot be set active.",
    }
  }

  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)

    const phase = normalizePhase(v.kind, v.phase)

    // Diet-only macro fields are dropped on training blocks.
    const isDiet = v.kind === "diet"
    const row = {
      kind: v.kind,
      name: v.name,
      goal: v.goal,
      phase,
      start_date: v.start_date,
      end_date: v.end_date,
      length_weeks: v.length_weeks,
      program_id: v.kind === "training" ? v.program_id : null,
      calorie_target: isDiet ? v.calorie_target : null,
      protein_target: isDiet ? v.protein_target : null,
      carb_target: isDiet ? v.carb_target : null,
      fat_target: isDiet ? v.fat_target : null,
      notes: v.notes,
      is_active: v.is_active,
    }

    let savedId = v.id

    if (v.id) {
      const { error } = await supabase
        .from("blocks")
        .update(row)
        .eq("id", v.id)
        .eq("user_id", userId)
      if (error) throw error
    } else {
      const { data, error } = await supabase
        .from("blocks")
        .insert({ ...row, user_id: userId })
        .select("id")
        .single()
      if (error) throw error
      savedId = (data as { id: string }).id
    }

    // Only one block runs at a time — activating this one pauses whatever
    // else was active, training or diet.
    let deactivated: DeactivatedBlock[] = []
    if (v.is_active && savedId) {
      deactivated = await deactivateOthers(supabase, userId, savedId)
    }

    revalidatePath("/blocks")
    revalidatePath("/progress")
    return { ok: true, id: savedId!, deactivated }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not save the block.",
    }
  }
}

export async function setActiveBlock(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)

    const { data: existing, error: readErr } = await supabase
      .from("blocks")
      .select("id, end_date, completed_at")
      .eq("id", id)
      .eq("user_id", userId)
      .single()
    if (readErr) throw readErr
    const target = existing as Pick<Block, "end_date" | "completed_at">

    if (active && target.completed_at != null) {
      return { ok: false, error: "Reopen this block before setting it active." }
    }
    if (
      active &&
      target.end_date != null &&
      target.end_date < new Date().toISOString().slice(0, 10)
    ) {
      return {
        ok: false,
        error: "This block has ended. Mark it complete or edit its end date.",
      }
    }

    // Only one block runs at a time — activating this one pauses whatever
    // else was active, training or diet.
    let deactivated: DeactivatedBlock[] = []
    if (active) {
      deactivated = await deactivateOthers(supabase, userId, id)
    }

    const { error } = await supabase
      .from("blocks")
      .update({ is_active: active })
      .eq("id", id)
      .eq("user_id", userId)
    if (error) throw error

    revalidatePath("/blocks")
    revalidatePath("/progress")
    return { ok: true, id, deactivated }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not update the block.",
    }
  }
}

export async function deleteBlock(id: string): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)

    const { error } = await supabase
      .from("blocks")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)
    if (error) throw error

    revalidatePath("/blocks")
    revalidatePath("/progress")
    return { ok: true, id }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not delete the block.",
    }
  }
}

/** Finish a block now and freeze its analytics window. */
export async function completeBlock(id: string): Promise<CompleteBlockResult> {
  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)
    const { data: existing, error: readError } = await supabase
      .from("blocks")
      .select("id, end_date, completed_at")
      .eq("id", id)
      .eq("user_id", userId)
      .single()
    if (readError) throw readError

    const completedAt = new Date()
    const today = completedAt.toISOString().slice(0, 10)
    const target = existing as Pick<Block, "end_date" | "completed_at">
    if (target.completed_at != null) {
      return {
        ok: true,
        id,
        completedAt: target.completed_at,
        endDate: target.end_date ?? today,
      }
    }

    const endDate =
      target.end_date != null && target.end_date < today
        ? target.end_date
        : today

    const { error } = await supabase
      .from("blocks")
      .update({
        completed_at: completedAt.toISOString(),
        end_date: endDate,
        is_active: false,
      })
      .eq("id", id)
      .eq("user_id", userId)
    if (error) throw error

    revalidatePath("/blocks")
    revalidatePath("/progress")
    return {
      ok: true,
      id,
      completedAt: completedAt.toISOString(),
      endDate,
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not complete the block.",
    }
  }
}

/** Return a completed block to the timeline without making it active. */
export async function reopenBlock(id: string): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)
    const { error } = await supabase
      .from("blocks")
      .update({ completed_at: null, is_active: false })
      .eq("id", id)
      .eq("user_id", userId)
    if (error) throw error

    revalidatePath("/blocks")
    revalidatePath("/progress")
    return { ok: true, id }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not reopen the block.",
    }
  }
}

/**
 * "Start this cycle over" — re-anchors the active program's week counter to
 * today, restarts the active training/diet blocks' own timelines, and begins
 * a fresh maintenance-calibration epoch. Nothing is deleted: set logs, body
 * readings, and nutrition history all stay exactly as logged — only the
 * "count from here" anchors move to today.
 */
export async function restartCurrentBlock(): Promise<RestartResult> {
  try {
    const supabase = await createClient()
    const userId = await requireUserId(supabase)
    const today = new Date().toISOString().slice(0, 10)

    const [activeProgram, { data: activeBlockRows, error: blocksErr }] =
      await Promise.all([
        getActiveProgram(),
        supabase
          .from("blocks")
          .select("id, kind")
          .eq("user_id", userId)
          .eq("is_active", true)
          .is("completed_at", null),
      ])
    if (blocksErr) throw blocksErr

    const activeBlocks = (activeBlockRows ?? []) as Pick<Block, "id" | "kind">[]
    if (!activeProgram && activeBlocks.length === 0) {
      return { ok: false, error: "Nothing active to restart yet." }
    }

    if (activeProgram) {
      await setProgramStartDate(activeProgram.id, today)
    }

    if (activeBlocks.length > 0) {
      const { error } = await supabase
        .from("blocks")
        .update({ start_date: today })
        .in("id", activeBlocks.map((b) => b.id))
      if (error) throw error
    }

    const calibrationRes = await resetMaintenanceCalibration()
    if (!calibrationRes.ok) throw new Error(calibrationRes.error)

    revalidatePath("/blocks")
    revalidatePath("/mesocycle")
    revalidatePath("/today")
    revalidatePath("/nutrition")
    revalidatePath("/progress")
    revalidatePath("/body")

    return {
      ok: true,
      programRestarted: Boolean(activeProgram),
      trainingBlockRestarted: activeBlocks.some((b) => b.kind === "training"),
      dietBlockRestarted: activeBlocks.some((b) => b.kind === "diet"),
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not restart.",
    }
  }
}
