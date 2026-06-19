"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { requireUserId } from "@/lib/data"
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

export type ActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Deactivate every other block of the same kind for this user. */
async function deactivateOthers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  kind: BlockKind,
  exceptId?: string,
) {
  let q = supabase
    .from("blocks")
    .update({ is_active: false })
    .eq("user_id", userId)
    .eq("kind", kind)
    .eq("is_active", true)
  if (exceptId) q = q.neq("id", exceptId)
  const { error } = await q
  if (error) throw error
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

    // Enforce single-active per kind when this block is set active.
    if (v.is_active && savedId) {
      await deactivateOthers(supabase, userId, v.kind, savedId)
    }

    revalidatePath("/blocks")
    return { ok: true, id: savedId! }
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

    // Need the kind to scope the deactivation of siblings.
    const { data: existing, error: readErr } = await supabase
      .from("blocks")
      .select("id, kind")
      .eq("id", id)
      .eq("user_id", userId)
      .single()
    if (readErr) throw readErr
    const kind = (existing as Pick<Block, "kind">).kind

    if (active) {
      await deactivateOthers(supabase, userId, kind, id)
    }

    const { error } = await supabase
      .from("blocks")
      .update({ is_active: active })
      .eq("id", id)
      .eq("user_id", userId)
    if (error) throw error

    revalidatePath("/blocks")
    return { ok: true, id }
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
    return { ok: true, id }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not delete the block.",
    }
  }
}
