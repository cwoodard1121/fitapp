'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, Sprout } from 'lucide-react'

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
} from '@/components/ui'
import { reseedDefaultProgram } from '@/app/(app)/settings/actions'

export function ReseedProgram({ hasProgram }: { hasProgram: boolean }) {
  const [pending, startTransition] = useTransition()

  function onReseed() {
    startTransition(async () => {
      const res = await reseedDefaultProgram()
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(
        hasProgram
          ? 'You already have a program — nothing changed.'
          : 'Seeded the default program.'
      )
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reseed default program</CardTitle>
        <CardDescription>
          An escape hatch if you ever start from nothing. This only creates the
          default program when you have none — it never overwrites your edits.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted">
          {hasProgram
            ? 'You already have an active program, so this is a no-op.'
            : 'You have no active program yet. Seed the starter block to begin.'}
        </p>
      </CardContent>
      <CardFooter className="justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onReseed}
          disabled={pending}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Sprout className="size-4" aria-hidden />
          )}
          Reseed default program
        </Button>
      </CardFooter>
    </Card>
  )
}
