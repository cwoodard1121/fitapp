'use client'

import type { ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CalendarRange, ListChecks } from 'lucide-react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui'

/**
 * Program now covers what used to be two separate nav destinations: editing
 * the exercise/day structure, and the mesocycle's current-week schedule +
 * start date. One tab bar, one URL (?tab=), so the two stay discoverable
 * together instead of splitting "your training plan" across two tabs.
 */
export function ProgramTabs({
  defaultTab,
  schedule,
  editor,
}: {
  defaultTab: 'schedule' | 'editor'
  schedule: ReactNode
  editor: ReactNode
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function onValueChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'schedule') params.delete('tab')
    else params.set('tab', value)
    const qs = params.toString()
    router.replace(qs ? `/program?${qs}` : '/program', { scroll: false })
  }

  return (
    <Tabs defaultValue={defaultTab} onValueChange={onValueChange} className="w-full">
      <TabsList>
        <TabsTrigger value="schedule" className="gap-1.5">
          <CalendarRange className="size-4" aria-hidden />
          Schedule
        </TabsTrigger>
        <TabsTrigger value="editor" className="gap-1.5">
          <ListChecks className="size-4" aria-hidden />
          Edit days
        </TabsTrigger>
      </TabsList>
      <TabsContent value="schedule">{schedule}</TabsContent>
      <TabsContent value="editor">{editor}</TabsContent>
    </Tabs>
  )
}
