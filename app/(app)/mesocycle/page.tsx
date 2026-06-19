import { format } from 'date-fns'
import { CalendarRange, Layers } from 'lucide-react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Stat } from '@/components/ui/stat'
import {
  ensureProfile,
  getActiveProgram,
  getProgramFull,
  mesocycleNumber,
  requireUserId,
  weekForDate,
} from '@/lib/data'
import { createClient } from '@/lib/supabase/server'
import type { ProgramDay, Session, SessionStatus } from '@/lib/types'
import { WeekGrid, type WeekRow } from '@/components/mesocycle/week-grid'
import { StartDateForm } from '@/components/mesocycle/start-date-form'
import { SeedProgramButton } from '@/components/mesocycle/seed-program-button'

export const dynamic = 'force-dynamic'

export default async function MesocyclePage() {
  const profile = await ensureProfile()
  const program = await getActiveProgram()

  if (!program) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        <Header />
        <Card className="mt-6">
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
      </div>
    )
  }

  const full = await getProgramFull(program.id)
  const days: ProgramDay[] = full?.days ?? []

  // Group sessions by week -> day_id -> status (one query for the program).
  const supabase = await createClient()
  const userId = await requireUserId(supabase)
  const { data: sessionRows } = await supabase
    .from('sessions')
    .select('week, day_id, status')
    .eq('program_id', program.id)
    .eq('user_id', userId)

  const byWeek = new Map<number, Map<string, SessionStatus>>()
  for (const s of (sessionRows as Pick<Session, 'week' | 'day_id' | 'status'>[]) ?? []) {
    let dayMap = byWeek.get(s.week)
    if (!dayMap) {
      dayMap = new Map()
      byWeek.set(s.week, dayMap)
    }
    dayMap.set(s.day_id, s.status)
  }

  const lengthWeeks = Math.max(1, program.length_weeks)
  const currentWeek = weekForDate(profile.start_date, lengthWeeks)
  const mesoNumber = mesocycleNumber(profile.start_date, lengthWeeks)

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
      isDeload: week === program.deload_week,
      isCalibration: week === 1,
      days: dayCells,
      doneCount,
      plannedCount: dayCells.length,
    }
  })

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <Header programName={program.name} />

      {/* Instrument readouts */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ReadoutCard
          icon={<CalendarRange className="h-4 w-4" aria-hidden />}
        >
          <Stat
            label="Current week"
            value={`${currentWeek} / ${lengthWeeks}`}
            tone="signal"
          />
        </ReadoutCard>
        <ReadoutCard icon={<Layers className="h-4 w-4" aria-hidden />}>
          <Stat label="Mesocycle" value={mesoNumber + 1} />
        </ReadoutCard>
        <ReadoutCard>
          <Stat label="Deload week" value={program.deload_week} />
        </ReadoutCard>
        <ReadoutCard>
          <Stat
            label="Started"
            value={
              profile.start_date
                ? format(new Date(`${profile.start_date.slice(0, 10)}T00:00:00`), 'MMM d')
                : 'Not set'
            }
          />
        </ReadoutCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Adjust start date</CardTitle>
          <CardDescription>
            {profile.start_date
              ? 'Change the date Week 1 begins to re-anchor the current week.'
              : 'Set when Week 1 begins so today maps to the right week.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StartDateForm initialStartDate={profile.start_date} />
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            {program.name}
          </h2>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted">
            {lengthWeeks} weeks
          </span>
        </div>
        <WeekGrid weeks={weeks} />
      </section>
    </div>
  )
}

function Header({ programName }: { programName?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
        Mesocycle overview
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">
        {programName ?? 'Your training block'}
      </h1>
      <p className="text-sm text-muted">
        Week 1 calibrates your baselines. The deload week backs off before the
        next cycle.
      </p>
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
