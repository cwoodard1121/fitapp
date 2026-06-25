'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

import type { Program } from '@/lib/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { setActiveProgramAction } from '@/app/(app)/program/actions'

/**
 * Compact active-program switcher for the Today / Mesocycle headers. Only one
 * program is active at a time; picking another makes it active and refreshes.
 * Falls back to plain text when the user owns a single program.
 */
export function ActiveProgramSelect({
  programs,
  activeId,
}: {
  programs: Program[]
  activeId: string
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()

  if (programs.length <= 1) {
    const only = programs.find((p) => p.id === activeId) ?? programs[0]
    return <p className="mt-1 truncate text-sm text-muted">{only?.name}</p>
  }

  function onChange(id: string) {
    if (id === activeId) return
    startTransition(async () => {
      const res = await setActiveProgramAction({ programId: id })
      if (res.ok) {
        toast.success('Switched active program.')
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="mt-1 flex items-center gap-2">
      <Select value={activeId} onValueChange={onChange} disabled={pending}>
        <SelectTrigger className="h-8 w-auto max-w-[16rem] gap-1.5 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {programs.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {pending ? (
        <Loader2 className="size-3.5 animate-spin text-muted" aria-hidden />
      ) : null}
    </div>
  )
}
