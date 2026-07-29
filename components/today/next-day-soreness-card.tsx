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
  const [ratings, setRatings] = React.useState<
    Record<string, number | null>
  >(() =>
    Object.fromEntries(
      checkin.muscles.map((muscle) => [
        muscle.muscleArea,
        muscle.soreness ?? null,
      ]),
    ),
  )
  const allRated =
    checkin.muscles.length > 0 &&
    checkin.muscles.every((muscle) => ratings[muscle.muscleArea] != null)

  function save() {
    const muscles: { muscleArea: string; soreness: number }[] = []
    for (const muscle of checkin.muscles) {
      const soreness = ratings[muscle.muscleArea]
      if (soreness == null) {
        toast.error('Rate every trained muscle before saving.')
        return
      }
      muscles.push({ muscleArea: muscle.muscleArea, soreness })
    }

    startTransition(async () => {
      const result = await saveSorenessCheckin({
        sessionId: checkin.sessionId,
        muscles,
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
            const value = ratings[muscle.muscleArea] ?? null
            const visualValue = value ?? 5
            return (
              <div key={muscle.muscleArea} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <Label htmlFor={id}>{muscle.muscleArea}</Label>
                  {value == null ? (
                    <span className="text-xs font-medium text-muted">
                      Not rated
                    </span>
                  ) : (
                    <span className="font-mono text-base font-semibold tabular-nums text-signal">
                      {value}
                      <span className="ml-0.5 text-xs font-normal text-muted">
                        /10
                      </span>
                    </span>
                  )}
                </div>
                <Slider
                  id={id}
                  min={0}
                  max={10}
                  step={1}
                  value={[visualValue]}
                  onPointerDown={() => {
                    if (value != null) return
                    setRatings((current) => ({
                      ...current,
                      [muscle.muscleArea]: visualValue,
                    }))
                  }}
                  onValueChange={(next) => {
                    const soreness = next[0]
                    if (soreness == null) return
                    setRatings((current) => ({
                      ...current,
                      [muscle.muscleArea]: soreness,
                    }))
                  }}
                  aria-label={`${muscle.muscleArea} soreness`}
                  aria-valuetext={
                    value == null
                      ? 'Not rated; move slider to rate'
                      : `${value} of 10`
                  }
                  className={value == null ? 'opacity-50' : undefined}
                />
                <div className="flex justify-between text-[11px] text-muted">
                  <span>Not sore</span>
                  <span>Extremely sore</span>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant={value === 0 ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() =>
                      setRatings((current) => ({
                        ...current,
                        [muscle.muscleArea]: 0,
                      }))
                    }
                  >
                    Not sore (0)
                  </Button>
                  {value != null ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setRatings((current) => ({
                          ...current,
                          [muscle.muscleArea]: null,
                        }))
                      }
                    >
                      Clear
                    </Button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">
          {allRated
            ? 'Every trained muscle is rated.'
            : 'Rate every muscle to save.'}
        </p>
        <Button type="button" onClick={save} disabled={pending || !allRated}>
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
