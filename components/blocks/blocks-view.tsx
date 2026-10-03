"use client"

import { useMemo, useState } from "react"
import { Plus, Dumbbell, Salad } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import type { Block, BlockKind, Unit } from "@/lib/types"
import type { BlockStats } from "@/lib/blocks/stats"
import { ActiveBlockCard } from "@/components/blocks/active-block-card"
import { BlockRow } from "@/components/blocks/block-row"
import { BlockForm } from "@/components/blocks/block-form"
import { BlockStatsDialog } from "@/components/blocks/block-stats-dialog"
import { RestartBlockDialog } from "@/components/blocks/restart-block-dialog"
import { computeProgress } from "@/components/blocks/utils"

interface BlocksViewProps {
  blocks: Block[]
  statsByBlock: Record<string, BlockStats>
  activeProgram: { id: string; name: string } | null
  unit: Unit
}

/** Sort non-active blocks: upcoming first (soonest), then current, then past. */
function sortTimeline(a: Block, b: Block): number {
  const order: Record<string, number> = {
    upcoming: 0,
    current: 1,
    undated: 2,
    completed: 3,
    past: 4,
  }
  const pa = computeProgress(a)
  const pb = computeProgress(b)
  if (order[pa.state] !== order[pb.state])
    return order[pa.state] - order[pb.state]
  // Within a group, sort by start date ascending for upcoming/current, desc for past.
  const sa = a.start_date ?? ""
  const sb = b.start_date ?? ""
  if (pa.state === "past" || pa.state === "completed") {
    return sb.localeCompare(sa)
  }
  return sa.localeCompare(sb)
}

export function BlocksView({
  blocks,
  statsByBlock,
  activeProgram,
  unit,
}: BlocksViewProps) {
  const [tab, setTab] = useState<BlockKind>("training")
  const [formOpen, setFormOpen] = useState(false)
  const [formKind, setFormKind] = useState<BlockKind>("training")
  const [editing, setEditing] = useState<Block | null>(null)
  const [statsBlock, setStatsBlock] = useState<Block | null>(null)

  const byKind = useMemo(() => {
    const training = blocks.filter((b) => b.kind === "training")
    const diet = blocks.filter((b) => b.kind === "diet")
    return { training, diet }
  }, [blocks])

  // Only one block runs at a time — whichever kind holds it, the other tab's
  // empty state should say so instead of just "no active block."
  const globallyActive = useMemo(
    () => blocks.find((b) => b.is_active && b.completed_at == null) ?? null,
    [blocks],
  )

  function openCreate(kind: BlockKind) {
    setFormKind(kind)
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(block: Block) {
    setFormKind(block.kind)
    setEditing(block)
    setFormOpen(true)
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-4 sm:pt-6">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="sr-only">Blocks</h1>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <RestartBlockDialog />
          <Button size="sm" onClick={() => openCreate(tab)}>
            <Plus aria-hidden />
            New block
          </Button>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between gap-2 sm:hidden">
        <RestartBlockDialog />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as BlockKind)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="training" className="gap-1.5">
            <Dumbbell aria-hidden className="size-4" />
            Training
          </TabsTrigger>
          <TabsTrigger value="diet" className="gap-1.5">
            <Salad aria-hidden className="size-4" />
            Diet
          </TabsTrigger>
        </TabsList>

        <TabsContent value="training" className="space-y-5">
          <KindSection
            kind="training"
            list={byKind.training}
            activeProgramName={activeProgram?.name ?? null}
            otherActiveName={
              globallyActive && globallyActive.kind !== "training"
                ? globallyActive.name
                : null
            }
            onCreate={() => openCreate("training")}
            onEdit={openEdit}
            onViewStats={setStatsBlock}
            onCompleted={setStatsBlock}
          />
        </TabsContent>

        <TabsContent value="diet" className="space-y-5">
          <KindSection
            kind="diet"
            list={byKind.diet}
            activeProgramName={activeProgram?.name ?? null}
            otherActiveName={
              globallyActive && globallyActive.kind !== "diet"
                ? globallyActive.name
                : null
            }
            onCreate={() => openCreate("diet")}
            onEdit={openEdit}
            onViewStats={setStatsBlock}
            onCompleted={setStatsBlock}
          />
        </TabsContent>
      </Tabs>

      {/* Sticky mobile CTA — parked above the bottom tab bar. */}
      <div className="fixed inset-x-0 bottom-nav z-20 border-t border-border bg-surface/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-surface/80 sm:hidden">
        <Button className="w-full" size="touch" onClick={() => openCreate(tab)}>
          <Plus aria-hidden />
          New {tab === "diet" ? "diet" : "training"} block
        </Button>
      </div>

      <BlockForm
        open={formOpen}
        onOpenChange={setFormOpen}
        kind={formKind}
        block={editing}
        activeProgram={activeProgram}
      />

      <BlockStatsDialog
        block={statsBlock}
        stats={statsBlock ? (statsByBlock[statsBlock.id] ?? null) : null}
        unit={unit}
        onOpenChange={(open) => {
          if (!open) setStatsBlock(null)
        }}
      />
    </div>
  )
}

interface KindSectionProps {
  kind: BlockKind
  list: Block[]
  activeProgramName: string | null
  otherActiveName: string | null
  onCreate: () => void
  onEdit: (block: Block) => void
  onViewStats: (block: Block) => void
  onCompleted: (block: Block) => void
}

function KindSection({
  kind,
  list,
  activeProgramName,
  otherActiveName,
  onCreate,
  onEdit,
  onViewStats,
  onCompleted,
}: KindSectionProps) {
  const active = list.find((b) => b.is_active && b.completed_at == null) ?? null
  const rest = list.filter((b) => b.id !== active?.id).sort(sortTimeline)

  return (
    <div className="space-y-5">
      <ActiveBlockCard
        kind={kind}
        block={active}
        programName={activeProgramName}
        otherActiveName={otherActiveName}
        onEdit={onEdit}
        onCreate={onCreate}
        onViewStats={onViewStats}
        onCompleted={onCompleted}
      />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-mono text-xs uppercase tracking-wider text-muted">
            Timeline
          </h3>
          <span className="font-mono text-xs tabular-nums text-muted">
            {rest.length} {rest.length === 1 ? "block" : "blocks"}
          </span>
        </div>
        <Separator className="mb-3" />

        {rest.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center">
            <p className="text-sm text-muted">
              No other {kind === "diet" ? "diet" : "training"} blocks yet.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={onCreate}
            >
              <Plus aria-hidden />
              Add a block
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {rest.map((block) => (
              <BlockRow
                key={block.id}
                block={block}
                onEdit={onEdit}
                onViewStats={onViewStats}
                onCompleted={onCompleted}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
