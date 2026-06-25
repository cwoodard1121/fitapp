'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Loader2, Info } from 'lucide-react'

import type { Profile, Unit } from '@/lib/types'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Input,
  Label,
  Button,
  Switch,
  Separator,
} from '@/components/ui'
import { updateProfile } from '@/app/(app)/settings/actions'

export function ProfileForm({ profile }: { profile: Profile }) {
  const [displayName, setDisplayName] = useState(profile.display_name ?? '')
  const [unit, setUnit] = useState<Unit>(profile.unit)
  const [deloadWeek, setDeloadWeek] = useState(String(profile.deload_week ?? 0))
  const [pending, startTransition] = useTransition()

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      const res = await updateProfile({
        display_name: displayName,
        unit,
        deload_week: Number(deloadWeek),
      })
      if (res.ok) toast.success('Saved your profile.')
      else toast.error(res.error)
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      {/* Profile -------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>How the app addresses you and your units.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="space-y-2">
            <Label htmlFor="display_name">Display name</Label>
            <Input
              id="display_name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="What should we call you?"
              autoComplete="name"
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="unit">Weight unit</Label>
              <p className="text-sm text-muted">
                Loads are labelled in{' '}
                <span className="font-mono text-foreground">{unit}</span>.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={
                  unit === 'lb'
                    ? 'font-mono text-sm font-semibold text-foreground'
                    : 'font-mono text-sm text-muted'
                }
              >
                lb
              </span>
              <Switch
                id="unit"
                checked={unit === 'kg'}
                onCheckedChange={(checked) => setUnit(checked ? 'kg' : 'lb')}
                aria-label="Toggle between pounds and kilograms"
              />
              <span
                className={
                  unit === 'kg'
                    ? 'font-mono text-sm font-semibold text-foreground'
                    : 'font-mono text-sm text-muted'
                }
              >
                kg
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mesocycle ------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle>Mesocycle</CardTitle>
          <CardDescription>
            When your block started and which week is a deload.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="deload_week">Deload week</Label>
              <Input
                id="deload_week"
                type="number"
                inputMode="numeric"
                min={0}
                max={52}
                step={1}
                value={deloadWeek}
                onChange={(e) => setDeloadWeek(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono tabular-nums"
              />
              <p className="text-xs text-muted">
                Week in the cycle that backs off. Use 0 for none.
              </p>
            </div>
          </div>

          <Separator />

          <div className="flex items-start gap-3 rounded-md border border-border bg-background/40 p-3">
            <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
            <p className="text-xs leading-relaxed text-muted">
              Default load increments live on each exercise in the program
              editor, since the right step differs by lift. Set a slot&apos;s
              increment there (e.g. 5 {unit} for compounds, 2.5 {unit} for
              isolation).
            </p>
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Saving
              </>
            ) : (
              'Save changes'
            )}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
