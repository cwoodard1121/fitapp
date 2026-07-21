import { format } from "date-fns"

import { createClient } from "@/lib/supabase/server"
import { requireUserId, getProfile, getActiveProgram } from "@/lib/data"
import { computeBlockStats } from "@/lib/blocks/stats"
import type {
  Block,
  BodyMetric,
  ExerciseSlot,
  NutritionLog,
  Session,
  SetEntry,
  SetLog,
} from "@/lib/types"

import { BlocksView } from "@/components/blocks/blocks-view"

export const metadata = {
  title: "Blocks",
}

const PAGE_SIZE = 1000

interface PageResult<T> {
  data: T[] | null
  error: unknown
}

/** Supabase caps SELECT responses, so page through complete personal history. */
async function fetchAll<T>(
  loadPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await loadPage(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = data ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }

  return rows
}

export default async function BlocksPage() {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)

  const [
    blockRows,
    profile,
    activeProgram,
    sessions,
    setLogs,
    setEntries,
    slots,
    nutritionLogs,
    bodyMetrics,
  ] = await Promise.all([
    fetchAll<Block>((from, to) =>
      supabase
        .from("blocks")
        .select("*")
        .eq("user_id", userId)
        .order("start_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    getProfile(),
    getActiveProgram(),
    fetchAll<Session>((from, to) =>
      supabase
        .from("sessions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    fetchAll<SetLog>((from, to) =>
      supabase
        .from("set_logs")
        .select("*")
        .eq("user_id", userId)
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    fetchAll<SetEntry>((from, to) =>
      supabase
        .from("set_entries")
        .select("*")
        .eq("user_id", userId)
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    fetchAll<ExerciseSlot>((from, to) =>
      supabase
        .from("exercise_slots")
        .select("*")
        .eq("user_id", userId)
        .order("id")
        .range(from, to),
    ),
    fetchAll<NutritionLog>((from, to) =>
      supabase
        .from("nutrition_logs")
        .select("*")
        .eq("user_id", userId)
        .order("logged_on")
        .order("id")
        .range(from, to),
    ),
    fetchAll<BodyMetric>((from, to) =>
      supabase
        .from("body_metrics")
        .select("*")
        .eq("user_id", userId)
        .order("measured_on")
        .order("id")
        .range(from, to),
    ),
  ])

  const today = format(new Date(), "yyyy-MM-dd")
  const statsByBlock = Object.fromEntries(
    blockRows.map((block) => [
      block.id,
      computeBlockStats({
        block,
        today,
        sessions,
        setLogs,
        setEntries,
        slots,
        nutritionLogs,
        bodyMetrics,
      }),
    ]),
  )

  return (
    <BlocksView
      blocks={blockRows}
      statsByBlock={statsByBlock}
      activeProgram={
        activeProgram
          ? { id: activeProgram.id, name: activeProgram.name }
          : null
      }
      unit={profile?.unit ?? "lb"}
    />
  )
}
