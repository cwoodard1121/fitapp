'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format, parseISO, startOfISOWeek } from 'date-fns'
import { Ruler } from 'lucide-react'

import { NavyTapeForm } from '@/components/body/navy-tape-form'
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

export function WeeklyNavyPrompt({
  heightCm,
  today,
}: {
  heightCm: number | null
  today: string
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const weekStart = format(startOfISOWeek(parseISO(today)), 'yyyy-MM-dd')
  const sessionKey = `simplegym:weekly-navy-prompt:${weekStart}`

  React.useEffect(() => {
    if (heightCm == null) return
    if (window.sessionStorage.getItem(sessionKey) !== 'shown') {
      window.sessionStorage.setItem(sessionKey, 'shown')
      setOpen(true)
    }
  }, [heightCm, sessionKey])

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
                {heightCm == null
                  ? 'Add your height in Settings before the first weekly tape.'
                  : 'Add neck and waist in centimeters. A reading more than 20% from your BIA reference is ignored, so you can measure again.'}
              </p>
            </div>
          </div>
          {heightCm == null ? (
            <Button asChild size="sm" className="shrink-0">
              <Link href="/settings">Set height</Link>
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              className="shrink-0"
              onClick={() => setOpen(true)}
            >
              Log weekly tape
            </Button>
          )}
        </CardContent>
      </Card>

      {heightCm != null ? (
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent
            side="bottom"
            className="mx-auto max-h-[92vh] max-w-lg overflow-y-auto"
          >
            <SheetHeader className="mb-4 text-left">
              <SheetTitle>Weekly Navy body fat</SheetTitle>
              <SheetDescription>
                Enter neck and waist in centimeters. Add more readings during
                the week from the Body page; accepted readings are averaged.
              </SheetDescription>
            </SheetHeader>
            <NavyTapeForm
              heightCm={heightCm}
              measuredOn={today}
              onDone={onDone}
            />
          </SheetContent>
        </Sheet>
      ) : null}
    </>
  )
}
