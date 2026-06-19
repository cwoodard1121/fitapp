"use client"

import { Dumbbell, Salad, Link2, Pencil, CalendarRange } from "lucide-react"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Stat } from "@/components/ui/stat"
import { Separator } from "@/components/ui/separator"
import type { Block, BlockKind } from "@/lib/types"
import {
  computeProgress,
  currentWeekLabel,
  formatRange,
  phaseLabel,
} from "@/components/blocks/utils"

interface ActiveBlockCardProps {
  kind: BlockKind
  block: Block | null
  programName: string | null
  onEdit: (block: Block) => void
  onCreate: () => void
}

export function ActiveBlockCard({
  kind,
  block,
  programName,
  onEdit,
  onCreate,
}: ActiveBlockCardProps) {
  const isDiet = kind === "diet"
  const Icon = isDiet ? Salad : Dumbbell
  const kindName = isDiet ? "diet" : "training"

  if (!block) {
    return (
      <Card className="flex flex-col items-start gap-3 border-dashed p-5">
        <div className="flex items-center gap-2 text-muted">
          <Icon className="size-4" aria-hidden />
          <span className="font-mono text-xs uppercase tracking-wider">
            Active {kindName} block
          </span>
        </div>
        <p className="text-sm text-muted">
          No active {kindName} block. Create one to start tracking this phase.
        </p>
        <Button variant="outline" size="sm" onClick={onCreate}>
          New {kindName} block
        </Button>
      </Card>
    )
  }

  const p = computeProgress(block)
  const weekLabel = currentWeekLabel(p)
  const phase = phaseLabel(kind, block.phase)

  return (
    <Card className="relative overflow-hidden p-5">
      {/* accent edge */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1 bg-signal"
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 text-muted">
            <Icon className="size-4 text-signal" aria-hidden />
            <span className="font-mono text-xs uppercase tracking-wider">
              Active {kindName} block
            </span>
          </div>
          <h2 className="truncate text-xl font-semibold tracking-tight text-foreground">
            {block.name}
          </h2>
          {block.goal ? (
            <p className="truncate text-sm text-muted">{block.goal}</p>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Edit active block"
          onClick={() => onEdit(block)}
        >
          <Pencil aria-hidden />
        </Button>
      </div>

      {/* meta badges */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {phase ? <Badge variant="signal">{phase}</Badge> : null}
        <Badge variant="secondary" className="gap-1">
          <CalendarRange aria-hidden />
          {formatRange(block)}
        </Badge>
        {kind === "training" && block.program_id && programName ? (
          <Badge variant="muted" className="gap-1">
            <Link2 aria-hidden />
            {programName}
          </Badge>
        ) : null}
      </div>

      {/* progress */}
      {p.percent != null ? (
        <div className="mt-4 space-y-2">
          <div className="flex items-end justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-muted">
              {weekLabel ?? "Progress"}
            </span>
            <span className="font-mono text-xs tabular-nums text-signal">
              {Math.round(p.percent)}%
            </span>
          </div>
          <Progress value={p.percent} />
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] tabular-nums text-muted">
              {p.weeksElapsed.toFixed(1)} / {p.totalWeeks} wk
            </span>
            {p.daysRemaining != null ? (
              <span className="font-mono text-[11px] tabular-nums text-muted">
                {p.daysRemaining >= 0
                  ? `${p.daysRemaining} days left`
                  : `${Math.abs(p.daysRemaining)} days over`}
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted">
          Add a start date and length to track weekly progress.
        </p>
      )}

      {/* diet targets readout */}
      {isDiet &&
      (block.calorie_target != null ||
        block.protein_target != null ||
        block.carb_target != null ||
        block.fat_target != null) ? (
        <>
          <Separator className="my-4" />
          <div className="grid grid-cols-4 gap-2">
            <Stat
              label="kcal"
              value={block.calorie_target}
              tone="default"
              size="sm"
            />
            <Stat
              label="Protein"
              value={block.protein_target}
              unit="g"
              size="sm"
            />
            <Stat label="Carbs" value={block.carb_target} unit="g" size="sm" />
            <Stat label="Fat" value={block.fat_target} unit="g" size="sm" />
          </div>
        </>
      ) : null}
    </Card>
  )
}
