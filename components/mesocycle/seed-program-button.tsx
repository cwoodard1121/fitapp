'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { seedProgram } from '@/app/(app)/mesocycle/actions'

export function SeedProgramButton() {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      size="lg"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await seedProgram()
          if (res.ok) toast.success('Default program ready.')
          else toast.error(res.error)
        })
      }
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Setting up
        </>
      ) : (
        <>
          <Sparkles className="h-4 w-4" aria-hidden />
          Seed default program
        </>
      )}
    </Button>
  )
}
