'use client'

import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import type { Program, Unit } from '@/lib/types'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ProgramHeader({
  program,
  unit,
  onRename,
  onUpdateMeta,
}: {
  program: Program
  unit: Unit
  onRename: (name: string) => Promise<boolean>
  onUpdateMeta: (lengthWeeks: number, deloadWeek: number) => Promise<boolean>
}) {
  const [name, setName] = useState(program.name)
  const [length, setLength] = useState(String(program.length_weeks))
  const [deload, setDeload] = useState(String(program.deload_week))
  const [savingName, setSavingName] = useState(false)
  const [savingMeta, setSavingMeta] = useState(false)

  async function commitName() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === program.name) {
      setName(program.name)
      return
    }
    setSavingName(true)
    const ok = await onRename(trimmed)
    setSavingName(false)
    if (!ok) setName(program.name)
  }

  const metaDirty =
    Number(length) !== program.length_weeks ||
    Number(deload) !== program.deload_week

  async function commitMeta() {
    const lw = Number(length)
    const dw = Number(deload)
    if (!Number.isFinite(lw) || !Number.isFinite(dw)) return
    setSavingMeta(true)
    const ok = await onUpdateMeta(lw, dw)
    setSavingMeta(false)
    if (!ok) {
      setLength(String(program.length_weeks))
      setDeload(String(program.deload_week))
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-mono text-xs uppercase tracking-[0.16em] text-muted">
          Program
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="program-name">Name</Label>
          <div className="relative">
            <Input
              id="program-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
              maxLength={80}
              className="h-12 pr-9 text-base font-medium"
              placeholder="Mesocycle 1"
            />
            {savingName ? (
              <Loader2
                className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted"
                aria-hidden
              />
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="length-weeks">Length (weeks)</Label>
            <Input
              id="length-weeks"
              type="number"
              inputMode="numeric"
              min={1}
              max={52}
              value={length}
              onChange={(e) => setLength(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="deload-week">Deload week</Label>
            <Input
              id="deload-week"
              type="number"
              inputMode="numeric"
              min={1}
              max={Number(length) || 52}
              value={deload}
              onChange={(e) => setDeload(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono tabular-nums"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">
            Deload week prescribes lighter loads and fewer sets. Loads are in{' '}
            <span className="font-mono">{unit}</span>; this also syncs your
            profile.
          </p>
          <Button
            size="sm"
            variant={metaDirty ? 'default' : 'secondary'}
            disabled={!metaDirty || savingMeta}
            onClick={commitMeta}
            className="shrink-0"
          >
            {savingMeta ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Check aria-hidden />
            )}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
