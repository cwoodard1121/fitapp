import { createClient } from "@/lib/supabase/server"
import { requireUserId, getProfile, getActiveProgram } from "@/lib/data"
import type { Block } from "@/lib/types"

import { BlocksView } from "@/components/blocks/blocks-view"

export const metadata = {
  title: "Blocks",
}

export default async function BlocksPage() {
  const supabase = await createClient()
  const userId = await requireUserId(supabase)

  const [{ data: blockRows, error }, profile, activeProgram] = await Promise.all(
    [
      supabase
        .from("blocks")
        .select("*")
        .eq("user_id", userId)
        .order("start_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false }),
      getProfile(),
      getActiveProgram(),
    ],
  )

  if (error) throw error

  const blocks = (blockRows ?? []) as Block[]

  return (
    <BlocksView
      blocks={blocks}
      activeProgram={
        activeProgram
          ? { id: activeProgram.id, name: activeProgram.name }
          : null
      }
      unit={profile?.unit ?? "lb"}
    />
  )
}
