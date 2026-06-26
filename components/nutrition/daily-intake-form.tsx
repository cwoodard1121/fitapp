'use client'

import * as React from 'react'
import { Loader2, Save } from 'lucide-react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
  Button,
} from '@/components/ui'

export interface IntakeFormValues {
  logged_on: string
  calories: string
  protein: string
  carbs: string
  fat: string
  notes: string
}

interface DailyIntakeFormProps {
  values: IntakeFormValues
  today: string
  pending: boolean
  onField: (field: keyof IntakeFormValues, value: string) => void
  onSubmit: () => void
}

const MACROS: {
  field: keyof IntakeFormValues
  label: string
  unit: string
  placeholder: string
}[] = [
  { field: 'calories', label: 'Calories', unit: 'kcal', placeholder: '0' },
  { field: 'protein', label: 'Protein', unit: 'g', placeholder: '0' },
  { field: 'carbs', label: 'Carbs', unit: 'g', placeholder: '0' },
  { field: 'fat', label: 'Fat', unit: 'g', placeholder: '0' },
]

function selectOnFocus(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.select()
}

export function DailyIntakeForm({
  values,
  today,
  pending,
  onField,
  onSubmit,
}: DailyIntakeFormProps) {
  const isToday = values.logged_on === today

  function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    onSubmit()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isToday ? "Log today's intake" : 'Log intake'}</CardTitle>
        <CardDescription>
          Add or update a day. Logging the same date again just updates it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleFormSubmit} className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label htmlFor="logged_on">Date</Label>
            <Input
              id="logged_on"
              type="date"
              value={values.logged_on}
              max={today}
              onChange={(e) => onField('logged_on', e.target.value)}
              className="font-mono tabular-nums"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {MACROS.map((m) => (
              <div key={m.field} className="space-y-2">
                <Label htmlFor={m.field}>
                  {m.label}{' '}
                  <span className="font-normal text-muted">({m.unit})</span>
                </Label>
                <Input
                  id={m.field}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  placeholder={m.placeholder}
                  value={values[m.field]}
                  onFocus={selectOnFocus}
                  onChange={(e) => onField(m.field, e.target.value)}
                  className="h-12 font-mono tabular-nums"
                />
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Anything worth remembering — refeed, travel, big lift day…"
              value={values.notes}
              onChange={(e) => onField('notes', e.target.value)}
              rows={2}
            />
          </div>

          {/* Sticky save bar on mobile (parked above the tab bar); inline on desktop. */}
          <div className="fixed inset-x-0 bottom-nav z-20 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-surface/80 sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
            <div className="mx-auto w-full max-w-3xl sm:max-w-none">
              <Button
                type="submit"
                size="touch"
                disabled={pending}
                className="font-semibold"
              >
                {pending ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden />
                    Saving
                  </>
                ) : (
                  <>
                    <Save aria-hidden />
                    {isToday ? 'Log today' : 'Save day'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
