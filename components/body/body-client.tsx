'use client'

import * as React from 'react'
import { format, parseISO } from 'date-fns'
import { Plus, Scale } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { Block, BodyMetric, Unit } from '@/lib/types'
import { hasNavyMeasurement } from '@/lib/body/body-fat'

import { BodyFatEstimator } from './body-fat-estimator'
import { BodyStats } from './body-stats'
import { EntriesList } from './entries-list'
import { LogForm } from './log-form'
import { NavyTapeForm } from './navy-tape-form'
import { NavyWeekCard } from './navy-week-card'
import { TrendChart } from './trend-chart'

interface BodyClientProps {
  /** Ascending by measured_on (oldest first). */
  entries: BodyMetric[]
  unit: Unit
  heightCm: number | null
  activeDietBlock: Pick<Block, 'phase' | 'start_date'> | null
  /** yyyy-MM-dd for "today" (computed server-side for stable SSR). */
  today: string
}

export function BodyClient({
  entries,
  unit,
  heightCm,
  activeDietBlock,
  today,
}: BodyClientProps) {
  const [open, setOpen] = React.useState(false)
  const [navyOpen, setNavyOpen] = React.useState(false)
  // The entry the form is bound to: null = brand-new weigh-in.
  const [editing, setEditing] = React.useState<BodyMetric | null>(null)
  const [editingNavy, setEditingNavy] = React.useState<BodyMetric | null>(null)

  const todayEntry = React.useMemo(
    () => entries.find((e) => e.measured_on === today) ?? null,
    [entries, today],
  )

  // Most-recent-first for the list.
  const descending = React.useMemo(() => [...entries].reverse(), [entries])

  function openLogToday() {
    setEditing(todayEntry)
    setOpen(true)
  }

  function openEdit(entry: BodyMetric) {
    if (entry.bodyweight == null && hasNavyMeasurement(entry)) {
      openEditNavy(entry)
      return
    }
    setEditing(entry)
    setOpen(true)
  }

  function openAddNavy() {
    setEditingNavy(null)
    setNavyOpen(true)
  }

  function openEditNavy(entry: BodyMetric) {
    setEditingNavy(entry)
    setNavyOpen(true)
  }

  const isEditingExisting = editing != null && editing.measured_on !== today
  const isTodayUpdate = editing != null && editing.measured_on === today

  const sheetTitle = isEditingExisting
    ? 'Edit weigh-in'
    : isTodayUpdate
      ? "Update today's weight"
      : "Log today's weight"

  const sheetDesc = isEditingExisting
    ? format(parseISO(editing!.measured_on), 'EEEE, MMM d')
    : 'Weight is required. BIA and a daily Navy reading are optional.'

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Body metrics</h1>
          <p className="text-sm text-muted">
            Track bodyweight and body fat over time.
          </p>
        </div>
        {entries.length > 0 ? (
          <Button
            onClick={openLogToday}
            className="hidden sm:inline-flex"
            aria-label="Log today's weight"
          >
            <Plus aria-hidden />
            Log weight
          </Button>
        ) : null}
      </header>

      {entries.length === 0 ? (
        <>
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-md border border-border bg-background text-signal">
                <Scale className="h-6 w-6" aria-hidden />
              </div>
              <div className="space-y-1">
                <p className="font-medium text-foreground">No weigh-ins yet</p>
                <p className="mx-auto max-w-xs text-sm text-muted">
                  Log your first weigh-in to start a trend. It takes one tap each
                  morning.
                </p>
              </div>
              <Button onClick={openLogToday} size="lg">
                <Plus aria-hidden />
                Log your first weigh-in
              </Button>
            </CardContent>
          </Card>
          <NavyWeekCard
            entries={entries}
            heightCm={heightCm}
            today={today}
            onAdd={openAddNavy}
            onEdit={openEditNavy}
          />
        </>
      ) : (
        <>
          <Card>
            <CardContent className="pt-4">
              <BodyStats entries={entries} unit={unit} activeDietBlock={activeDietBlock} />
            </CardContent>
          </Card>

          <NavyWeekCard
            entries={entries}
            heightCm={heightCm}
            today={today}
            onAdd={openAddNavy}
            onEdit={openEditNavy}
          />

          {entries.length >= 2 ? (
            <TrendChart
              entries={entries}
              unit={unit}
            />
          ) : null}

          <BodyFatEstimator
            entries={entries}
            unit={unit}
            activeDietBlock={activeDietBlock}
          />

          <Card>
            <CardHeader>
              <CardTitle>Recent entries</CardTitle>
              <CardDescription>Tap the menu to edit or delete.</CardDescription>
            </CardHeader>
            <CardContent>
              <EntriesList entries={descending} unit={unit} onEdit={openEdit} />
            </CardContent>
          </Card>
        </>
      )}

      {/* Mobile sticky log bar — floats just above the bottom tab bar. */}
      {entries.length > 0 ? (
        <div className="sticky bottom-nav-room z-30 sm:hidden">
          <Button onClick={openLogToday} size="touch" className="shadow-lg">
            <Plus aria-hidden />
            {todayEntry ? "Update today's weight" : "Log today's weight"}
          </Button>
        </div>
      ) : null}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[92vh] max-w-lg overflow-y-auto"
        >
          <SheetHeader className="mb-4 text-left">
            <SheetTitle>{sheetTitle}</SheetTitle>
            <SheetDescription>{sheetDesc}</SheetDescription>
          </SheetHeader>
          <LogForm
            key={editing?.id ?? 'new'}
            unit={unit}
            heightCm={heightCm}
            defaultDate={today}
            initial={editing}
            onDone={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {heightCm != null ? (
        <Sheet open={navyOpen} onOpenChange={setNavyOpen}>
          <SheetContent
            side="bottom"
            className="mx-auto max-h-[92vh] max-w-lg overflow-y-auto"
          >
            <SheetHeader className="mb-4 text-left">
              <SheetTitle>
                {editingNavy ? 'Edit Navy reading' : 'Add Navy reading'}
              </SheetTitle>
              <SheetDescription>
                Accepted readings are averaged into this week&apos;s Navy estimate.
              </SheetDescription>
            </SheetHeader>
            <NavyTapeForm
              key={editingNavy?.id ?? 'new-navy'}
              heightCm={heightCm}
              measuredOn={editingNavy?.measured_on ?? today}
              initial={editingNavy}
              onDone={() => setNavyOpen(false)}
            />
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  )
}
