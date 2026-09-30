import { format } from 'date-fns'
import { CalendarRange, Layers } from 'lucide-react'

import {
  getActiveProgram,
  getPrograms,
  getProfile,
  getProgramFull,
  mesocycleNumber,
  requireUserId,
  seedDefaultProgram,
  weekForDate,
} from '@/lib/data'
import { createClient } from '@/lib/supabase/server'
import type { ProgramDay, Session, SessionStatus } from '@/lib/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Stat } from '@/components/ui'
import { ProgramEditor } from '@/components/program/program-editor'
import { ProgramTabs } from '@/components/program/program-tabs'
import { WeekGrid, type WeekRow } from '@/components/mesocycle/week-grid'
import { StartDateForm } from '@/components/mesocycle/start-date-form'
import { SeedProgramButton } from '@/components/mesocycle/seed-program-button'
import { ActiveProgramSelect } from '@/components/program/active-program-select'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Program',
}

/**
 * Program now owns both what used to be /program (day/exercise editor) and
 * /mesocycle (current-week schedule + start date) as two tabs of one
 * destination — they're both "what's my training plan doing right now,"
 * and splitting them across separate nav items just added clutter.
 */
export default async function ProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; tab?: string }>
}) {
  const { p: pParam, tab: tabParam } = await searchParams
  const profile = await getProfile()
  const unit = profile?.unit ?? 'lb'

  let programs = await getPrograms()
  if (programs.length === 0) {
    // First visit — seed the default program so neither tab is ever empty.
    await seedDefaultProgram()
    programs = await getPrograms()
  }

  const active = programs.find((p) => p.is_active) ?? null
  // Editor tab: explicit ?p= (if owned), else active, else first.
  const selected = (pParam && programs.find((p) => p.id === pParam)) || active || programs[0]
  const editorFull = selected ? await getProgramFull(selected.id) : null

  const editor = editorFull ? (
    <ProgramEditor
      key={editorFull.program.id}
      initial={editorFull}
      unit={unit}
      programs={programs}
      activeId={active?.id ?? null}
    />
  ) : (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <p className="text-sm text-muted">
        We couldn’t load your program. Reload the page to try again.
      </p>
    </div>
  )

  const schedule = await renderSchedule(active, selected, editorFull)

  const defaultTab = tabParam === 'editor' ? 'editor' : 'schedule'

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <ProgramTabs defaultTab={defaultTab} schedule={schedule} editor={editor} />
    </div>
  )
}

async function renderSchedule(
  active: Awaited<ReturnType<typeof getActiveProgram>>,
  selected: Awaited<ReturnType<typeof getPrograms>>[number] | undefined,
  editorFull: Awaited<ReturnType<typeof getProgramFull>>,
) {
  if (!active) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No active program yet</CardTitle>
          <CardDescription>
            Seed the default program to map out your mesocycle, then set a
            start date so the current week lines up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SeedProgramButton />
        </CardContent>
      </Card>
    )
  }

  // Reuse the editor's already-fetched tree when editing the active program
  // (the common case) instead of fetching it twice.
  const full = selected && active.id === selected.id && editorFull ? editorFull : await getProgramFull(active.id)
  const days: ProgramDay[] = full?.days ?? []
  const lengthWeeks = Math.max(1, active.length_weeks)
  const startDate = active.start_date
  const currentWeek = weekForDate(startDate, lengthWeeks)
  const mesoNumber = mesocycleNumber(startDate, lengthWeeks)

  const supabase = await createClient()
  const userId = await requireUserId(supabase)
  const { data: sessionRows } = await supabase
    .from('sessions')
    .select('week, day_id, status')
    .eq('program_id', active.id)
    .eq('user_id', userId)
    .eq('schedule_version', active.schedule_version)
    .eq('mesocycle', mesoNumber)

  const byWeek = new Map<number, Map<string, SessionStatus>>()
  for (const s of (sessionRows as Pick<Session, 'week' | 'day_id' | 'status'>[]) ?? []) {
    let dayMap = byWeek.get(s.week)
    if (!dayMap) {
      dayMap = new Map()
      byWeek.set(s.week, dayMap)
    }
    dayMap.set(s.day_id, s.status)
  }

  const weeks: WeekRow[] = Array.from({ length: lengthWeeks }, (_, i) => {
    const week = i + 1
    const dayMap = byWeek.get(week)
    const dayCells = days.map((d) => ({
      dayId: d.id,
      label: d.label,
      dayNumber: d.day_number,
      status: dayMap?.get(d.id) ?? ('planned' as SessionStatus),
    }))
    const doneCount = dayCells.filter((c) => c.status === 'done').length
    return {
      week,
      isCurrent: week === currentWeek,
      isDeload: week === active.deload_week,
      isCalibration: week === 1,
      days: dayCells,
      doneCount,
      plannedCount: dayCells.length,
    }
  })

  const programs = await getPrograms()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted">
          Week 1 calibrates your baselines. The deload week backs off before
          the next cycle.
        </p>
        <ActiveProgramSelect programs={programs} activeId={active.id} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ReadoutCard icon={<CalendarRange className="h-4 w-4" aria-hidden />}>
          <Stat label="Current week" value={`${currentWeek} / ${lengthWeeks}`} tone="signal" />
        </ReadoutCard>
        <ReadoutCard icon={<Layers className="h-4 w-4" aria-hidden />}>
          <Stat label="Mesocycle" value={mesoNumber + 1} />
        </ReadoutCard>
        <ReadoutCard>
          <Stat label="Deload week" value={active.deload_week} />
        </ReadoutCard>
        <ReadoutCard>
          <Stat
            label="Started"
            value={
              startDate
                ? format(new Date(`${startDate.slice(0, 10)}T00:00:00`), 'MMM d')
                : 'Not set'
            }
          />
        </ReadoutCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Adjust start date</CardTitle>
          <CardDescription>
            {startDate
              ? 'Change the date Week 1 begins to re-anchor this program’s current week.'
              : 'Set when Week 1 begins so today maps to the right week.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StartDateForm programId={active.id} initialStartDate={startDate} />
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight">{active.name}</h2>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted">
            {lengthWeeks} weeks
          </span>
        </div>
        <WeekGrid weeks={weeks} />
      </section>
    </div>
  )
}

function ReadoutCard({
  children,
  icon,
}: {
  children: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface p-3 shadow-sm">
      {children}
      {icon ? <span className="text-muted">{icon}</span> : null}
    </div>
  )
}
