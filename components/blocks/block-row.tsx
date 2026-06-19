"use client"

import { useTransition } from "react"
import { MoreVertical, Pencil, Trash2, Check } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import type { Block } from "@/lib/types"
import {
  computeProgress,
  currentWeekLabel,
  formatRange,
  phaseLabel,
  type TimeState,
} from "@/components/blocks/utils"
import { setActiveBlock, deleteBlock } from "@/app/(app)/blocks/actions"

const stateMeta: Record<
  TimeState,
  { label: string; variant: "success" | "signal" | "muted" | "warning" }
> = {
  current: { label: "Current", variant: "success" },
  upcoming: { label: "Upcoming", variant: "signal" },
  past: { label: "Past", variant: "muted" },
  undated: { label: "Undated", variant: "warning" },
}

interface BlockRowProps {
  block: Block
  onEdit: (block: Block) => void
}

export function BlockRow({ block, onEdit }: BlockRowProps) {
  const [pending, startTransition] = useTransition()
  const p = computeProgress(block)
  const phase = phaseLabel(block.kind, block.phase)
  const meta = stateMeta[p.state]
  const weekLabel = currentWeekLabel(p)
  const isDiet = block.kind === "diet"

  function onSetActive() {
    startTransition(async () => {
      const res = await setActiveBlock(block.id, true)
      if (res.ok) toast.success(`${block.name} is now active`)
      else toast.error(res.error)
    })
  }

  function onDelete() {
    startTransition(async () => {
      const res = await deleteBlock(block.id)
      if (res.ok) toast.success("Block deleted")
      else toast.error(res.error)
    })
  }

  return (
    <div
      className={`flex items-stretch gap-3 rounded-md border border-border bg-surface p-3 transition-opacity ${
        pending ? "opacity-60" : ""
      } ${block.is_active ? "border-signal/40" : ""}`}
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {block.name}
          </span>
          {block.is_active ? (
            <Badge variant="signal" className="shrink-0">
              Active
            </Badge>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={meta.variant} className="shrink-0">
            {meta.label}
          </Badge>
          {phase ? (
            <Badge variant="outline" className="shrink-0">
              {phase}
            </Badge>
          ) : null}
          <span className="font-mono text-[11px] tabular-nums text-muted">
            {formatRange(block)}
          </span>
        </div>

        {p.percent != null ? (
          <div className="flex items-center gap-2 pt-0.5">
            <Progress value={p.percent} className="h-1.5" />
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted">
              {weekLabel ?? `${Math.round(p.percent)}%`}
            </span>
          </div>
        ) : null}

        {isDiet && block.calorie_target != null ? (
          <p className="font-mono text-[11px] tabular-nums text-muted">
            {block.calorie_target} kcal
            {block.protein_target != null ? ` · ${block.protein_target}P` : ""}
            {block.carb_target != null ? ` · ${block.carb_target}C` : ""}
            {block.fat_target != null ? ` · ${block.fat_target}F` : ""}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col items-end justify-between">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Block actions"
              disabled={pending}
            >
              <MoreVertical aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onEdit(block)}>
              <Pencil aria-hidden />
              Edit
            </DropdownMenuItem>
            {!block.is_active ? (
              <DropdownMenuItem onSelect={onSetActive}>
                <Check aria-hidden />
                Set active
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={onDelete}
              className="text-gate-red focus:text-gate-red"
            >
              <Trash2 aria-hidden />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {!block.is_active ? (
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={onSetActive}
            disabled={pending}
          >
            Set active
          </Button>
        ) : null}
      </div>
    </div>
  )
}
