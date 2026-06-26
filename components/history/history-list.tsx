"use client"

import * as React from "react"
import Link from "next/link"
import { format } from "date-fns"
import { ChevronRight, Dumbbell, Filter, Inbox } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Stat } from "@/components/ui/stat"
import { cn } from "@/lib/utils"
import type { HistorySessionVM, HistoryListData } from "@/components/history/types"

const ALL = "__all__"

function statusBadge(status: HistorySessionVM["status"]) {
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

interface Group {
  key: string
  label: string
  sessions: HistorySessionVM[]
}

function groupSessions(sessions: HistorySessionVM[]): Group[] {
  const groups: Group[] = []
  const index = new Map<string, Group>()
  for (const s of sessions) {
    const key = `${s.mesocycle}-${s.week}`
    let g = index.get(key)
    if (!g) {
      g = {
        key,
        label: `Mesocycle ${s.mesocycle} · Week ${s.week}`,
        sessions: [],
      }
      index.set(key, g)
      groups.push(g)
    }
    g.sessions.push(s)
  }
  return groups
}

export function HistoryList({ sessions, exerciseNames, unit }: HistoryListData) {
  const [filter, setFilter] = React.useState<string>(ALL)

  const filtered = React.useMemo(() => {
    if (filter === ALL) return sessions
    return sessions.filter((s) => s.exercises.includes(filter))
  }, [sessions, filter])

  const groups = React.useMemo(() => groupSessions(filtered), [filtered])

  // No history at all — the true empty state.
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border bg-surface px-6 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-md border border-border bg-background text-muted">
          <Inbox className="h-6 w-6" aria-hidden />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-medium">No sessions logged yet</h2>
          <p className="text-sm text-muted">
            Your finished workouts will show up here once you start logging.
          </p>
        </div>
        <Button asChild>
          <Link href="/today">
            <Dumbbell aria-hidden />
            Go to today
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Filter — sticky on mobile so it stays in thumb reach while scrolling.
          Parks just below the sticky app header instead of colliding with it. */}
      <div className="sticky top-header z-10 -mx-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger
              aria-label="Filter by exercise"
              className="flex-1"
            >
              <SelectValue placeholder="All exercises" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All exercises</SelectItem>
              {exerciseNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-surface px-6 py-12 text-center">
          <p className="text-sm text-muted">
            No sessions logged{" "}
            <span className="font-medium text-foreground">{filter}</span> yet.
          </p>
          <Button variant="outline" size="sm" onClick={() => setFilter(ALL)}>
            Clear filter
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.key} className="space-y-2">
              <h2 className="px-1 text-[11px] font-medium uppercase tracking-wider text-muted">
                {group.label}
              </h2>
              <ul className="space-y-2">
                {group.sessions.map((s) => (
                  <li key={s.id}>
                    <SessionRow session={s} unit={unit} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function SessionRow({
  session,
  unit,
}: {
  session: HistorySessionVM
  unit: string
}) {
  const date = new Date(session.dateIso)
  const dateLabel = Number.isNaN(date.getTime())
    ? "—"
    : format(date, "EEE, MMM d")

  return (
    <Link
      href={`/history/${session.id}`}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-lg border border-border bg-surface p-3 transition-colors hover:bg-border/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {session.dayLabel}
          </span>
          {statusBadge(session.status)}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="font-mono tabular-nums">{dateLabel}</span>
          {!session.dated ? <span aria-hidden>· not dated</span> : null}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Stat
          label="Lifts"
          value={session.exerciseCount}
          size="sm"
          className="items-end"
        />
        <Stat
          label="Tonnage"
          value={session.tonnage > 0 ? Math.round(session.tonnage) : null}
          unit={unit}
          size="sm"
          className="items-end"
        />
        <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      </div>
    </Link>
  )
}
