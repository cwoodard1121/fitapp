'use client'

import * as React from 'react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import type { GoalMetricType, GoalStatus, Unit } from '@/lib/types'
import { createGoal, updateGoal, type GoalInput } from '@/app/(app)/goals/actions'
import type { GoalWithCurrent } from './types'
import { METRIC_LABELS, defaultUnitFor } from './progress'

const METRIC_ORDER: GoalMetricType[] = [
  'e1rm',
  'bodyweight',
  'bodyfat',
  'volume',
  'custom',
]

const METRIC_HINTS: Record<GoalMetricType, string> = {
  e1rm: 'Current pulled from your best recent estimated 1RM for the exercise.',
  bodyweight: 'Current pulled from your latest body metric.',
  bodyfat: 'Current prefers estimated body fat when a lean-mass anchor exists.',
  volume: 'Current summed from your last 7 days of training tonnage.',
  custom: 'You track this one yourself — we just hold the target.',
}

function toNum(s: string): number | null {
  const t = s.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function numStr(n: number | null): string {
  return n == null ? '' : String(n)
}

interface GoalFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Editing an existing goal, or null to create a new one. */
  goal: GoalWithCurrent | null
  unit: Unit
}

export function GoalForm({ open, onOpenChange, goal, unit }: GoalFormProps) {
  const isEdit = !!goal
  const [pending, startTransition] = useTransition()

  const [title, setTitle] = useState('')
  const [metric, setMetric] = useState<GoalMetricType>('e1rm')
  const [exercise, setExercise] = useState('')
  const [startValue, setStartValue] = useState('')
  const [targetValue, setTargetValue] = useState('')
  const [targetUnit, setTargetUnit] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [status, setStatus] = useState<GoalStatus>('active')
  const [notes, setNotes] = useState('')

  // Reset the form whenever the sheet opens for a different goal.
  React.useEffect(() => {
    if (!open) return
    if (goal) {
      setTitle(goal.title)
      setMetric(goal.metric_type)
      setExercise(goal.exercise_name ?? '')
      setStartValue(numStr(goal.start_value))
      setTargetValue(numStr(goal.target_value))
      setTargetUnit(goal.target_unit ?? '')
      setTargetDate(goal.target_date ?? '')
      setStatus(goal.status)
      setNotes(goal.notes ?? '')
    } else {
      setTitle('')
      setMetric('e1rm')
      setExercise('')
      setStartValue('')
      setTargetValue('')
      setTargetUnit(defaultUnitFor('e1rm', unit))
      setTargetDate('')
      setStatus('active')
      setNotes('')
    }
  }, [open, goal, unit])

  function onMetricChange(next: GoalMetricType) {
    setMetric(next)
    // Refresh the suggested unit unless the user has typed a custom one.
    setTargetUnit((cur) => {
      const prevDefaults = METRIC_ORDER.map((m) => defaultUnitFor(m, unit))
      if (cur === '' || prevDefaults.includes(cur)) {
        return defaultUnitFor(next, unit)
      }
      return cur
    })
  }

  function submit() {
    if (!title.trim()) {
      toast.error('Give the goal a title.')
      return
    }
    if (metric === 'e1rm' && !exercise.trim()) {
      toast.error('Pick the exercise to track.')
      return
    }

    const input: GoalInput = {
      title: title.trim(),
      metric_type: metric,
      exercise_name: metric === 'e1rm' ? exercise.trim() : null,
      start_value: toNum(startValue),
      target_value: toNum(targetValue),
      target_unit: targetUnit.trim() || null,
      target_date: targetDate || null,
      status,
      notes: notes.trim() || null,
    }

    startTransition(async () => {
      const res = isEdit
        ? await updateGoal(goal!.id, input)
        : await createGoal(input)
      if (res.ok) {
        toast.success(isEdit ? 'Goal updated.' : 'Goal added.')
        onOpenChange(false)
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92svh] overflow-y-auto rounded-t-xl"
      >
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Edit goal' : 'New goal'}</SheetTitle>
          <SheetDescription>
            Set a target and we&apos;ll track your progress toward it.
          </SheetDescription>
        </SheetHeader>

        <form
          className="mt-5 space-y-5"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="goal-title">Title</Label>
            <Input
              id="goal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="225 lb bench, drop to 12% body fat…"
              autoFocus
              maxLength={120}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="goal-metric">Metric</Label>
              <Select
                value={metric}
                onValueChange={(v) => onMetricChange(v as GoalMetricType)}
              >
                <SelectTrigger id="goal-metric">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRIC_ORDER.map((m) => (
                    <SelectItem key={m} value={m}>
                      {METRIC_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {metric === 'e1rm' ? (
              <div className="space-y-2">
                <Label htmlFor="goal-exercise">Exercise</Label>
                <Input
                  id="goal-exercise"
                  value={exercise}
                  onChange={(e) => setExercise(e.target.value)}
                  placeholder="Barbell bench press"
                  maxLength={120}
                />
              </div>
            ) : null}
          </div>

          <p className="text-xs leading-snug text-muted">
            {METRIC_HINTS[metric]}
          </p>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="goal-start">Start</Label>
              <Input
                id="goal-start"
                value={startValue}
                onChange={(e) => setStartValue(e.target.value)}
                inputMode="decimal"
                type="number"
                step="any"
                placeholder="0"
                className="font-mono tabular-nums"
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal-target">Target</Label>
              <Input
                id="goal-target"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                inputMode="decimal"
                type="number"
                step="any"
                placeholder="0"
                className="font-mono tabular-nums"
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal-unit">Unit</Label>
              <Input
                id="goal-unit"
                value={targetUnit}
                onChange={(e) => setTargetUnit(e.target.value)}
                placeholder={unit}
                maxLength={20}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="goal-date">Target date</Label>
              <Input
                id="goal-date"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="font-mono"
              />
            </div>
            {isEdit ? (
              <div className="space-y-2">
                <Label htmlFor="goal-status">Status</Label>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as GoalStatus)}
                >
                  <SelectTrigger id="goal-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="achieved">Achieved</SelectItem>
                    <SelectItem value="abandoned">Abandoned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal-notes">Notes</Label>
            <Textarea
              id="goal-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why this matters, how you'll get there…"
              rows={3}
              maxLength={2000}
            />
          </div>

          <SheetFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {isEdit ? 'Save changes' : 'Add goal'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
