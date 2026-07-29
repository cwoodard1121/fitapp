'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Activity, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { saveSorenessCheckin } from '@/app/(app)/today/actions'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Label,
  Slider,
} from '@/components/ui'
import type { PendingSorenessCheckin } from '@/lib/data/soreness'

export function NextDaySorenessCard({
  checkin,
}: {
  checkin: PendingSorenessCheckin
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [ratings, setRatings] = React.useState<Record<string, number>>(() =>
    Object.fromEntries(
      checkin.muscles.map((muscle) => [
        muscle.muscleArea,
        muscle.soreness ?? 0,
      ]),
    ),
  )

  function save() {
    startTransition(async () => {
      const result = await saveSorenessCheckin({
        sessionId: checkin.sessionId,
        muscles: checkin.muscles.map((muscle) => ({
          muscleArea: muscle.muscleArea,
          soreness: ratings[muscle.muscleArea] ?? 0,
        })),
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Next-day soreness saved.')
      router.refresh()
    })
  }

  return (
    <Card className="mt-4 border-signal/40 bg-signal/[0.04]">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-signal/40 bg-signal/10 text-signal">
            <Activity aria-hidden />
          </div>
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base">How sore are you today?</CardTitle>
            <CardDescription>
              Rate the muscles trained in {checkin.sessionLabel}. Soreness is a
              supporting signal—not proof of growth—and the engine only uses it
              to refine the next exposure.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col gap-5">
          {checkin.muscles.map((muscle) => {
            const id = `next-day-soreness-${checkin.sessionId}-${muscle.muscleArea
              .toLocaleLowerCase()
              .replace(/[^a-z0-9]+/g, '-')}`
            const value = ratings[muscle.muscleArea] ?? 0
            return (
              <div key={muscle.muscleArea} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <Label htmlFor={id}>{muscle.muscleArea}</Label>
                  <span className="font-mono text-base font-semibold tabular-nums text-signal">
                    {value}
                    <span className="ml-0.5 text-xs font-normal text-muted">
                      /10
                    </span>
                  </span>
                </div>
                <Slider
                  id={id}
                  min={0}
                  max={10}
                  step={1}
                  value={[value]}
                  onValueChange={(next) =>
                    setRatings((current) => ({
                      ...current,
                      [muscle.muscleArea]: next[0] ?? value,
                    }))
                  }
                  aria-label={`${muscle.muscleArea} soreness`}
                />
                <div className="flex justify-between text-[11px] text-muted">
                  <span>Not sore</span>
                  <span>Extremely sore</span>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>

      <CardFooter className="justify-end">
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? (
            <>
              <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden />
              Saving
            </>
          ) : (
            'Save soreness'
          )}
        </Button>
      </CardFooter>
    </Card>
  )
}
