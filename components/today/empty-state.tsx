'use client'

import * as React from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Dumbbell, Loader2 } from 'lucide-react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { seedStarterProgram } from '@/app/(app)/today/actions'

/**
 * Shown when the user has no active program yet. Tells them the next action and
 * offers a one-tap starter program so they can begin logging immediately.
 */
export function EmptyState() {
  const [pending, startTransition] = React.useTransition()

  function onSeed() {
    startTransition(async () => {
      const res = await seedStarterProgram()
      if (res.ok) toast.success('Starter program ready — let’s train.')
      else toast.error(res.error)
    })
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <div className="mb-1 flex size-11 items-center justify-center rounded-md border border-border bg-background text-signal">
          <Dumbbell className="size-5" aria-hidden />
        </div>
        <CardTitle>No program yet</CardTitle>
        <CardDescription>
          You need an active program before you can log a session. Start with the
          built-in template, or build your own.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" onClick={onSeed} disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Creating
            </>
          ) : (
            'Use starter program'
          )}
        </Button>
        <Button asChild variant="outline">
          <Link href="/program">Build my own</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
