'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO, startOfISOWeek } from 'date-fns'
import { Ruler } from 'lucide-react'

import { LogForm } from '@/components/body/log-form'
import {
  Button,
  Card,
  CardContent,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui'
import type { BodyMetric, Unit } from '@/lib/types'

export function WeeklyNavyPrompt({
  entries,
  unit,
  today,
}: {
  entries: BodyMetric[]
  unit: Unit
  today: string
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const todayEntry = entries.find((entry) => entry.measured_on === today) ?? null
  const weekStart = format(startOfISOWeek(parseISO(today)), 'yyyy-MM-dd')
  const sessionKey = `simplegym:weekly-navy-prompt:${weekStart}`

  React.useEffect(() => {
    if (window.sessionStorage.getItem(sessionKey) !== 'shown') {
      window.sessionStorage.setItem(sessionKey, 'shown')
      setOpen(true)
    }
  }, [sessionKey])

  function onOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) window.sessionStorage.setItem(sessionKey, 'shown')
  }

  function onDone() {
    window.sessionStorage.setItem(sessionKey, 'shown')
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <Card className="mt-4 border-signal/40 bg-signal/[0.04]">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-signal/40 bg-signal/10 text-signal">
              <Ruler className="size-4" aria-hidden />
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-foreground">
                Weekly body fat due
              </p>
              <p className="text-xs leading-relaxed text-muted">
                Add this week&apos;s neck and waist tape. This reminder disappears
                as soon as it is logged.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            className="shrink-0"
            onClick={() => setOpen(true)}
          >
            Log weekly tape
          </Button>
        </CardContent>
      </Card>

      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[92vh] max-w-lg overflow-y-auto"
        >
          <SheetHeader className="mb-4 text-left">
            <SheetTitle>Weekly Navy body fat</SheetTitle>
            <SheetDescription>
              Log height, neck, and waist with today&apos;s weigh-in. Height
              prefills after your first tape.
            </SheetDescription>
          </SheetHeader>
          <LogForm
            unit={unit}
            entries={entries}
            defaultDate={today}
            initial={todayEntry}
            onDone={onDone}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}
