'use client'

/**
 * Offline-safe versions of the actions you use mid-workout and at meals.
 * Import these instead of the raw server actions.
 */

import { format } from 'date-fns'

import {
  finishSession as finishSessionRaw,
  saveSessionReadiness as saveSessionReadinessRaw,
  saveSetEntries as saveSetEntriesRaw,
  saveSorenessCheckIns as saveSorenessCheckInsRaw,
  setLastSelectedWeek as setLastSelectedWeekRaw,
} from '@/app/(app)/today/actions'
import { setHabitCompleted as setHabitCompletedRaw } from '@/app/(app)/today/habit-actions'
import {
  deleteNutritionLog as deleteNutritionLogRaw,
  upsertNutritionLog as upsertNutritionLogRaw,
} from '@/app/(app)/nutrition/actions'

import { offlineAction } from './offline-queue'

export const saveSetEntries = offlineAction(
  'saveSetEntries',
  saveSetEntriesRaw,
  (input) => `${input.sessionId}:${input.slotId}`,
)

export const saveSessionReadiness = offlineAction(
  'saveSessionReadiness',
  saveSessionReadinessRaw,
  (input) => input.sessionId,
)

export const saveSorenessCheckIns = offlineAction(
  'saveSorenessCheckIns',
  saveSorenessCheckInsRaw,
)

export const finishSession = offlineAction(
  'finishSession',
  finishSessionRaw,
  (input) => input.sessionId,
)

export const setLastSelectedWeek = offlineAction(
  'setLastSelectedWeek',
  setLastSelectedWeekRaw,
  () => 'week',
)

const setHabitCompletedQueued = offlineAction(
  'setHabitCompleted',
  setHabitCompletedRaw,
  (input) => `${input.habitId}:${input.date}`,
)

/** Pin the date now, so a late replay still marks the right day. */
export function setHabitCompleted(input: Parameters<typeof setHabitCompletedRaw>[0]) {
  return setHabitCompletedQueued({
    ...input,
    date: input.date ?? format(new Date(), 'yyyy-MM-dd'),
  })
}

export const upsertNutritionLog = offlineAction(
  'upsertNutritionLog',
  upsertNutritionLogRaw,
  (input) => input.logged_on,
)

export const deleteNutritionLog = offlineAction(
  'deleteNutritionLog',
  deleteNutritionLogRaw,
  (input) => input.logged_on,
)
