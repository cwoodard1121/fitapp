import Link from "next/link"
import { notFound } from "next/navigation"
import { format } from "date-fns"
import { ArrowLeft } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import {
  requireUserId,
  getProfile,
  getSlotsForDay,
  getSetLogsForSession,
  buildTodayView,
} from "@/lib/data"
import { epley1RM } from "@/lib/engine/engine"
import type { Program, ProgramDay, Session, SetLog } from "@/lib/types"
import { Stat } from "@/components/ui/stat"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SlotReadout } from "@/components/history/slot-readout"

export const metadata = { title: "Session" }

function statusBadge(status: Session["status"]) {
  switch (status) {
    case "done":
      return <Badge variant="success">Done</Badge>
    case "in_progress":
      return <Badge variant="signal">In progress</Badge>
    case "skipped":
      return <Badge variant="muted">Skipped</Badge>
    default:
      return <Badge variant="muted">Planned</Badge>
  }
}

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params

  const supabase = await createClient()
  const userId = await requireUserId(supabase)

  const { data: sessionRow, error: sErr } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle()
  if (sErr) throw sErr
  if (!sessionRow) notFound()
  const session = sessionRow as Session

  const profile = await getProfile()
  const unit = profile?.unit ?? "lb"

  const [{ data: programRow }, { data: dayRow }, slots, logs] =
    await Promise.all([
      supabase
        .from("programs")
        .select("*")
        .eq("id", session.program_id)
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("program_days")
        .select("*")
        .eq("id", session.day_id)
        .eq("user_id", userId)
        .maybeSingle(),
      getSlotsForDay(session.day_id),
      getSetLogsForSession(session.id),
    ])

  const program = programRow as Program | null
  const day = dayRow as ProgramDay | null
  const deloadWeek = program?.deload_week ?? profile?.deload_week ?? 5

  // Recompute the engine's decision for each slot from this session's logs.
  const views = await buildTodayView(
    session,
    slots,
    logs,
    deloadWeek,
    profile?.readiness_weights,
  )

  // e1RM trajectory per slot, up to and including this session's week.
  const slotIds = slots.map((s) => s.id)
  const e1rmBySlot = new Map<string, number[]>()
  if (slotIds.length > 0) {
    const { data: histRows, error: hErr } = await supabase
      .from("set_logs")
      .select("*")
      .in("slot_id", slotIds)
      .eq("user_id", userId)
      .lte("week", session.week)
      .order("week", { ascending: true })
    if (hErr) throw hErr
    for (const row of (histRows as SetLog[]) ?? []) {
      if (row.actual_load == null || row.best_reps == null) continue
      const series = e1rmBySlot.get(row.slot_id) ?? []
      series.push(Math.round(epley1RM(row.actual_load, row.best_reps) * 10) / 10)
      e1rmBySlot.set(row.slot_id, series)
    }
  }

  const dateIso = session.performed_at ?? session.created_at
  const date = new Date(dateIso)
  const dateLabel = Number.isNaN(date.getTime())
    ? "—"
    : format(date, "EEEE, MMM d, yyyy")

  // Session totals from the recomputed views.
  let totalTonnage = 0
  let loggedCount = 0
  for (const v of views) {
    if (v.result.tonnage != null) totalTonnage += v.result.tonnage
    if (
      v.log &&
      (v.log.actual_load != null ||
        v.log.best_reps != null ||
        v.log.actual_sets != null ||
        v.log.actual_rir != null)
    ) {
      loggedCount += 1
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5">
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted">
          <Link href="/history">
            <ArrowLeft aria-hidden />
            History
          </Link>
        </Button>
      </div>

      <header className="mb-5 space-y-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {day?.label ?? "Workout"}
          </h1>
          {statusBadge(session.status)}
        </div>
        <p className="font-mono text-sm tabular-nums text-muted">
          {dateLabel}
          {session.performed_at == null ? " · not dated" : ""}
          {" · "}
          {`Mesocycle wk ${session.week}`}
        </p>

        <div className="mt-2 flex items-end gap-6 rounded-lg border border-border bg-surface p-4">
          <Stat label="Lifts logged" value={loggedCount} size="default" />
          <Stat
            label="Total tonnage"
            value={totalTonnage > 0 ? Math.round(totalTonnage) : null}
            unit={unit}
            size="default"
          />
        </div>
      </header>

      <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted">
        Every slot, and the engine&apos;s call
      </p>

      {views.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface px-6 py-12 text-center">
          <p className="text-sm text-muted">
            This day has no exercise slots.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {views.map((view) => (
            <SlotReadout
              key={view.slot.id}
              view={view}
              unit={unit}
              e1rmSeries={e1rmBySlot.get(view.slot.id) ?? []}
            />
          ))}
        </div>
      )}
    </div>
  )
}
