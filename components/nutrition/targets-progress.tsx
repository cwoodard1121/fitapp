'use client'

import Link from 'next/link'
import { Target, ArrowRight } from 'lucide-react'

import type { Block, NutritionLog } from '@/lib/types'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Progress,
  Stat,
  Badge,
  Button,
} from '@/components/ui'
import { cn } from '@/lib/utils'

interface TargetsProgressProps {
  activeBlock: Block | null
  todayLog: NutritionLog | null
}

type MacroKey = 'calorie' | 'protein' | 'carb' | 'fat'

const MACRO_ROWS: {
  key: MacroKey
  label: string
  unit: string
  targetField: keyof Block
  intakeField: keyof NutritionLog
}[] = [
  {
    key: 'calorie',
    label: 'Calories',
    unit: 'kcal',
    targetField: 'calorie_target',
    intakeField: 'calories',
  },
  {
    key: 'protein',
    label: 'Protein',
    unit: 'g',
    targetField: 'protein_target',
    intakeField: 'protein',
  },
  {
    key: 'carb',
    label: 'Carbs',
    unit: 'g',
    targetField: 'carb_target',
    intakeField: 'carbs',
  },
  {
    key: 'fat',
    label: 'Fat',
    unit: 'g',
    targetField: 'fat_target',
    intakeField: 'fat',
  },
]

export function TargetsProgress({
  activeBlock,
  todayLog,
}: TargetsProgressProps) {
  // Empty state — no active diet block to measure against.
  if (!activeBlock) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Track against a diet block</CardTitle>
          <CardDescription>
            You have no active diet block. Set one to see today&apos;s intake vs
            your calorie and macro targets, with progress bars and what&apos;s
            left for the day.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/blocks">
              <Target aria-hidden />
              Set a diet block
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const rows = MACRO_ROWS.map((row) => {
    const target = activeBlock[row.targetField] as number | null
    const intakeRaw = todayLog
      ? (todayLog[row.intakeField] as number | null)
      : null
    const intake = intakeRaw ?? 0
    const hasTarget = typeof target === 'number' && target > 0
    const pct = hasTarget ? Math.min(100, (intake / (target as number)) * 100) : 0
    const remaining = hasTarget ? (target as number) - intake : null
    const over = remaining !== null && remaining < 0
    return { ...row, target, intake, hasTarget, pct, remaining, over }
  })

  const visible = rows.filter((r) => r.hasTarget)

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Today vs target</CardTitle>
          <CardDescription>
            {todayLog
              ? 'How today stacks up against your active diet block.'
              : 'Log today to see it fill in against your targets.'}
          </CardDescription>
        </div>
        <Badge variant="outline" className="shrink-0">
          {activeBlock.name}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-5">
        {visible.length === 0 ? (
          <p className="text-sm text-muted">
            This diet block has no calorie or macro targets set yet. Add them on
            the{' '}
            <Link
              href="/blocks"
              className="font-medium text-signal underline-offset-4 hover:underline"
            >
              blocks
            </Link>{' '}
            screen.
          </p>
        ) : (
          visible.map((r) => (
            <div key={r.key} className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-foreground">
                  {r.label}
                </span>
                <span className="font-mono text-sm tabular-nums text-muted">
                  <span className="text-foreground">{Math.round(r.intake)}</span>
                  {' / '}
                  {Math.round(r.target as number)}
                  <span className="ml-1 text-[0.85em]">{r.unit}</span>
                </span>
              </div>
              <Progress
                value={r.pct}
                className={cn(
                  r.over &&
                    '[&>div]:bg-gate-red'
                )}
              />
              <div className="flex justify-end">
                <Stat
                  size="sm"
                  tone={r.over ? 'red' : r.pct >= 100 ? 'green' : 'default'}
                  label={r.over ? 'over by' : 'remaining'}
                  value={Math.abs(Math.round(r.remaining as number))}
                  unit={r.unit}
                  className="items-end"
                  labelClassName="text-[10px]"
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
