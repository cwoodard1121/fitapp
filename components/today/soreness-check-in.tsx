'use client'

import * as React from 'react'
import { Activity, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import type { SorenessCheckInPrompt } from '@/lib/types'
import { saveSorenessCheckIns } from '@/app/(app)/today/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'

export function SorenessCheckIn({
  prompts,
}: {
  prompts: SorenessCheckInPrompt[]
}) {
  const [pending, startTransition] = React.useTransition()
  const [ratings, setRatings] = React.useState<Record<string, number>>(() =>
    Object.fromEntries(prompts.map((prompt) => [prompt.muscleKey, 0])),
  )

  if (prompts.length === 0) return null

  function save() {
    startTransition(async () => {
      const result = await saveSorenessCheckIns({
        reports: prompts.map((prompt) => ({
          sourceSessionId: prompt.sourceSessionId,
          muscleKey: prompt.muscleKey,
          soreness: ratings[prompt.muscleKey] ?? 0,
        })),
      })

      if (result.ok) {
        toast.success("Today's soreness saved.")
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Card className="mt-4 overflow-hidden border-signal/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="text-signal" aria-hidden />
          Soreness check-in
        </CardTitle>
        <CardDescription>
          Soreness can show up later. Rate each recently trained muscle once
          today so your next targets can account for it.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {prompts.map((prompt, index) => {
          const rating = ratings[prompt.muscleKey] ?? 0
          const timing = prompt.daysAfter === 1 ? 'Trained yesterday' : 'Trained 2 days ago'
          return (
            <React.Fragment key={prompt.muscleKey}>
              {index > 0 ? <Separator /> : null}
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <Label
                      htmlFor={`daily-soreness-${index}`}
                      className="text-sm font-semibold"
                    >
                      {prompt.muscleArea}
                    </Label>
                    <p className="truncate text-xs text-muted">
                      {timing} · {prompt.exerciseNames.join(', ')}
                    </p>
                  </div>
                  <Badge variant={rating >= 8 ? 'danger' : rating >= 6 ? 'warning' : 'secondary'}>
                    {rating}/10
                  </Badge>
                </div>
                <Slider
                  id={`daily-soreness-${index}`}
                  min={0}
                  max={10}
                  step={1}
                  value={[rating]}
                  onValueChange={(value) =>
                    setRatings((current) => ({
                      ...current,
                      [prompt.muscleKey]: value[0] ?? rating,
                    }))
                  }
                  aria-label={`${prompt.muscleArea} soreness today`}
                />
                <div className="flex justify-between text-[11px] text-muted">
                  <span>0 · Not sore</span>
                  <span>10 · Extremely sore</span>
                </div>
              </div>
            </React.Fragment>
          )
        })}
      </CardContent>

      <CardFooter>
        <Button type="button" size="touch" onClick={save} disabled={pending}>
          {pending ? (
            <>
              <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden />
              Saving
            </>
          ) : (
            "Save today's soreness"
          )}
        </Button>
      </CardFooter>
    </Card>
  )
}
