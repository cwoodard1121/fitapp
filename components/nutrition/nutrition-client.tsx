'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import type { Block, NutritionLog, Unit } from '@/lib/types'
import {
  upsertNutritionLog,
  deleteNutritionLog,
  type UpsertNutritionInput,
} from '@/app/(app)/nutrition/actions'

import { DailyIntakeForm, type IntakeFormValues } from './daily-intake-form'
import { TargetsProgress } from './targets-progress'
import { DeficitTracker } from './weekly-deficit'
import { RecentDays } from './recent-days'
import { CaloriesTrend } from './calories-trend'

function blankForm(date: string): IntakeFormValues {
  return {
    logged_on: date,
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
    notes: '',
  }
}

function formFromLog(log: NutritionLog): IntakeFormValues {
  const s = (n: number | null) => (n === null || n === undefined ? '' : String(n))
  return {
    logged_on: log.logged_on,
    calories: s(log.calories),
    protein: s(log.protein),
    carbs: s(log.carbs),
    fat: s(log.fat),
    notes: log.notes ?? '',
  }
}

interface NutritionClientProps {
  today: string
  activeBlock: Block | null
  /** Wide window (used in full by the deficit tracker; sliced for the list/trend). */
  logs: NutritionLog[]
  maintenance: number | null
  unit: Unit
  /** metric_date -> steps, for the activity-adjusted deficit. */
  stepsByDate: Record<string, number>
  /** Latest bodyweight in kg, for the step formula. */
  weightKg: number | null
  /** Steps/day the maintenance assumes (null -> 10000 default). */
  stepBaseline: number | null
  /** Outlier filter from the profile: ignore days under this many kcal (null = off). */
  minCalories: number | null
}

/** Recent days kept on screen for the list + trend (the deficit tracker uses all). */
const RECENT_DAYS = 21

export function NutritionClient({
  today,
  activeBlock,
  logs,
  maintenance,
  unit,
  stepsByDate,
  weightKg,
  stepBaseline,
  minCalories,
}: NutritionClientProps) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()

  const recentLogs = React.useMemo(() => logs.slice(0, RECENT_DAYS), [logs])

  const todayLog = React.useMemo(
    () => logs.find((l) => l.logged_on === today) ?? null,
    [logs, today]
  )

  // Seed the form with today's row if it already exists, so editing today is
  // a one-tap update rather than a fresh entry.
  const [values, setValues] = React.useState<IntakeFormValues>(() =>
    todayLog ? formFromLog(todayLog) : blankForm(today)
  )

  const setField = React.useCallback(
    (field: keyof IntakeFormValues, value: string) => {
      setValues((prev) => ({ ...prev, [field]: value }))
    },
    []
  )

  function handleSubmit() {
    const payload: UpsertNutritionInput = { ...values }
    startTransition(async () => {
      const res = await upsertNutritionLog(payload)
      if (res.ok) {
        toast.success(
          values.logged_on === today
            ? 'Logged today.'
            : `Logged ${values.logged_on}.`
        )
        // Reset back to a fast, blank "today" entry after a save for a day
        // other than today; keep today's values visible when editing today.
        if (values.logged_on !== today) {
          setValues(blankForm(today))
        }
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  function handleEdit(log: NutritionLog) {
    setValues(formFromLog(log))
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    toast.info(`Editing ${log.logged_on}.`)
  }

  function handleDelete(loggedOn: string) {
    startTransition(async () => {
      const res = await deleteNutritionLog({ logged_on: loggedOn })
      if (res.ok) {
        toast.success(`Removed ${loggedOn}.`)
        if (values.logged_on === loggedOn) {
          setValues(blankForm(today))
        }
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <TargetsProgress activeBlock={activeBlock} todayLog={todayLog} />

      <DeficitTracker
        logs={logs}
        today={today}
        maintenance={maintenance}
        calorieTarget={activeBlock?.calorie_target ?? null}
        unit={unit}
        stepsByDate={stepsByDate}
        weightKg={weightKg}
        stepBaseline={stepBaseline}
        minCalories={minCalories}
        phase={activeBlock?.phase ?? null}
        blockStart={activeBlock?.start_date ?? null}
      />

      <DailyIntakeForm
        values={values}
        today={today}
        pending={pending}
        onField={setField}
        onSubmit={handleSubmit}
      />

      <CaloriesTrend
        logs={recentLogs}
        today={today}
        calorieTarget={activeBlock?.calorie_target ?? null}
      />

      <RecentDays
        logs={recentLogs}
        today={today}
        pending={pending}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </div>
  )
}
