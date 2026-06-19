'use client'

import { useMemo, useState } from 'react'
import { Plus, Target } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import type { Unit } from '@/lib/types'
import { GoalForm } from './goal-form'
import { GoalCard } from './goal-card'
import type { GoalWithCurrent } from './types'

interface GoalsBoardProps {
  goals: GoalWithCurrent[]
  unit: Unit
}

export function GoalsBoard({ goals, unit }: GoalsBoardProps) {
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<GoalWithCurrent | null>(null)

  const { active, archived } = useMemo(() => {
    const active = goals.filter((g) => g.status === 'active')
    const archived = goals.filter((g) => g.status !== 'active')
    return { active, archived }
  }, [goals])

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(goal: GoalWithCurrent) {
    setEditing(goal)
    setFormOpen(true)
  }

  const hasAny = goals.length > 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-1">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
            Goals
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">
            What you&apos;re chasing
          </h1>
        </div>
        {/* Desktop / tablet create button (mobile uses the sticky bar). */}
        <Button onClick={openCreate} className="hidden sm:inline-flex">
          <Plus aria-hidden />
          New goal
        </Button>
      </div>

      {!hasAny ? (
        <EmptyState onCreate={openCreate} />
      ) : (
        <Tabs defaultValue="active">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="active" className="flex-1 sm:flex-none">
              Active
              <span className="ml-1.5 font-mono tabular-nums text-muted">
                {active.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="archive" className="flex-1 sm:flex-none">
              Archive
              <span className="ml-1.5 font-mono tabular-nums text-muted">
                {archived.length}
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            {active.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
                No active goals. Add one to start tracking progress.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {active.map((g) => (
                  <GoalCard key={g.id} goal={g} onEdit={openEdit} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="archive">
            {archived.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
                Nothing archived yet. Achieved and abandoned goals land here.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {archived.map((g) => (
                  <GoalCard key={g.id} goal={g} onEdit={openEdit} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Sticky mobile create bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 backdrop-blur sm:hidden">
        <Button size="touch" onClick={openCreate}>
          <Plus aria-hidden />
          New goal
        </Button>
      </div>

      <GoalForm
        open={formOpen}
        onOpenChange={setFormOpen}
        goal={editing}
        unit={unit}
      />
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border bg-surface px-6 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-md border border-border bg-background text-signal">
        <Target className="size-6" aria-hidden />
      </div>
      <div className="space-y-1">
        <h2 className="text-base font-medium">Set your first goal</h2>
        <p className="mx-auto max-w-xs text-sm text-muted">
          Pick a target — a heavier lift, a leaner bodyweight, more weekly
          volume — and we&apos;ll track your progress automatically.
        </p>
      </div>
      <Button onClick={onCreate}>
        <Plus aria-hidden />
        New goal
      </Button>
    </div>
  )
}
