"use client"

import { useEffect, useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import type { Block, BlockKind } from "@/lib/types"
import { phaseOptions } from "@/components/blocks/utils"
import { saveBlock, type BlockFormInput } from "@/app/(app)/blocks/actions"

interface BlockFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: BlockKind
  /** Existing block when editing; null when creating. */
  block: Block | null
  activeProgram: { id: string; name: string } | null
}

type FieldState = {
  name: string
  goal: string
  phase: string
  start_date: string
  end_date: string
  length_weeks: string
  program_id: boolean // link to active program (training only)
  calorie_target: string
  protein_target: string
  carb_target: string
  fat_target: string
  notes: string
  is_active: boolean
}

function emptyState(): FieldState {
  return {
    name: "",
    goal: "",
    phase: "",
    start_date: "",
    end_date: "",
    length_weeks: "",
    program_id: false,
    calorie_target: "",
    protein_target: "",
    carb_target: "",
    fat_target: "",
    notes: "",
    is_active: false,
  }
}

function fromBlock(block: Block): FieldState {
  return {
    name: block.name ?? "",
    goal: block.goal ?? "",
    phase: block.phase ?? "",
    start_date: block.start_date?.slice(0, 10) ?? "",
    end_date: block.end_date?.slice(0, 10) ?? "",
    length_weeks: block.length_weeks != null ? String(block.length_weeks) : "",
    program_id: Boolean(block.program_id),
    calorie_target:
      block.calorie_target != null ? String(block.calorie_target) : "",
    protein_target:
      block.protein_target != null ? String(block.protein_target) : "",
    carb_target: block.carb_target != null ? String(block.carb_target) : "",
    fat_target: block.fat_target != null ? String(block.fat_target) : "",
    notes: block.notes ?? "",
    is_active: block.is_active ?? false,
  }
}

const selectOnFocus = (e: React.FocusEvent<HTMLInputElement>) =>
  e.currentTarget.select()

export function BlockForm({
  open,
  onOpenChange,
  kind,
  block,
  activeProgram,
}: BlockFormProps) {
  const [state, setState] = useState<FieldState>(emptyState)
  const [pending, startTransition] = useTransition()
  const isEditing = Boolean(block)
  const isDiet = kind === "diet"

  // Reset the form whenever it opens for a new target.
  useEffect(() => {
    if (open) setState(block ? fromBlock(block) : emptyState())
  }, [open, block])

  function set<K extends keyof FieldState>(key: K, value: FieldState[K]) {
    setState((s) => ({ ...s, [key]: value }))
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!state.name.trim()) {
      toast.error("Give the block a name.")
      return
    }

    const input: BlockFormInput = {
      id: block?.id,
      kind,
      name: state.name,
      goal: state.goal,
      phase: state.phase,
      start_date: state.start_date,
      end_date: state.end_date,
      length_weeks: state.length_weeks,
      program_id:
        kind === "training" && state.program_id && activeProgram
          ? activeProgram.id
          : "",
      calorie_target: state.calorie_target,
      protein_target: state.protein_target,
      carb_target: state.carb_target,
      fat_target: state.fat_target,
      notes: state.notes,
      is_active: state.is_active,
    }

    startTransition(async () => {
      const res = await saveBlock(input)
      if (res.ok) {
        toast.success(isEditing ? "Block updated" : "Block created")
        onOpenChange(false)
      } else {
        toast.error(res.error)
      }
    })
  }

  const phases = phaseOptions(kind)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92svh] overflow-y-auto rounded-t-xl p-0"
      >
        <div className="mx-auto w-full max-w-xl">
          <SheetHeader className="p-5 pb-3 text-left">
            <SheetTitle>
              {isEditing ? "Edit" : "New"} {isDiet ? "diet" : "training"} block
            </SheetTitle>
            <SheetDescription>
              {isDiet
                ? "Set a nutrition phase with targets and a window."
                : "Plan a training phase and link it to your program."}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={onSubmit} className="space-y-5 px-5 pb-28">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="block-name">Name</Label>
              <Input
                id="block-name"
                value={state.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder={isDiet ? "Spring cut" : "Hypertrophy block 1"}
                autoFocus
                maxLength={120}
              />
            </div>

            {/* Goal */}
            <div className="space-y-2">
              <Label htmlFor="block-goal">Goal</Label>
              <Input
                id="block-goal"
                value={state.goal}
                onChange={(e) => set("goal", e.target.value)}
                placeholder={
                  isDiet ? "Drop to 12% bodyfat" : "Add size to back & quads"
                }
                maxLength={280}
              />
            </div>

            {/* Phase */}
            <div className="space-y-2">
              <Label htmlFor="block-phase">Phase</Label>
              <Select
                value={state.phase || undefined}
                onValueChange={(v) => set("phase", v)}
              >
                <SelectTrigger id="block-phase">
                  <SelectValue placeholder="Choose a phase" />
                </SelectTrigger>
                <SelectContent>
                  {phases.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dates + length */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="block-start">Start date</Label>
                <Input
                  id="block-start"
                  type="date"
                  value={state.start_date}
                  onChange={(e) => set("start_date", e.target.value)}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="block-end">End date</Label>
                <Input
                  id="block-end"
                  type="date"
                  value={state.end_date}
                  onChange={(e) => set("end_date", e.target.value)}
                  className="font-mono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="block-weeks">Length (weeks)</Label>
              <Input
                id="block-weeks"
                type="number"
                inputMode="numeric"
                min={1}
                max={104}
                value={state.length_weeks}
                onChange={(e) => set("length_weeks", e.target.value)}
                onFocus={selectOnFocus}
                placeholder="6"
                className="font-mono tabular-nums"
              />
            </div>

            {/* Training: link to active program */}
            {kind === "training" && (
              <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-background p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    Link to active program
                  </p>
                  <p className="truncate text-xs text-muted">
                    {activeProgram
                      ? activeProgram.name
                      : "No active program yet"}
                  </p>
                </div>
                <Switch
                  checked={state.program_id}
                  disabled={!activeProgram}
                  onCheckedChange={(v) => set("program_id", v)}
                  aria-label="Link to active program"
                />
              </div>
            )}

            {/* Diet: macro targets */}
            {isDiet && (
              <>
                <Separator />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Daily targets
                  </p>
                  <p className="text-xs text-muted">
                    Calories and macros for this phase. Leave blank to skip.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="block-cal">Calories</Label>
                    <Input
                      id="block-cal"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={state.calorie_target}
                      onChange={(e) => set("calorie_target", e.target.value)}
                      onFocus={selectOnFocus}
                      placeholder="2400"
                      className="font-mono tabular-nums"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="block-protein">Protein (g)</Label>
                    <Input
                      id="block-protein"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={state.protein_target}
                      onChange={(e) => set("protein_target", e.target.value)}
                      onFocus={selectOnFocus}
                      placeholder="180"
                      className="font-mono tabular-nums"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="block-carb">Carbs (g)</Label>
                    <Input
                      id="block-carb"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={state.carb_target}
                      onChange={(e) => set("carb_target", e.target.value)}
                      onFocus={selectOnFocus}
                      placeholder="250"
                      className="font-mono tabular-nums"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="block-fat">Fat (g)</Label>
                    <Input
                      id="block-fat"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={state.fat_target}
                      onChange={(e) => set("fat_target", e.target.value)}
                      onFocus={selectOnFocus}
                      placeholder="70"
                      className="font-mono tabular-nums"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="block-notes">Notes</Label>
              <Textarea
                id="block-notes"
                value={state.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Anything to remember about this block…"
                rows={3}
                maxLength={2000}
              />
            </div>

            {/* Set active */}
            <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-background p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  Set as active {isDiet ? "diet" : "training"} block
                </p>
                <p className="text-xs text-muted">
                  Deactivates any other active {isDiet ? "diet" : "training"}{" "}
                  block.
                </p>
              </div>
              <Switch
                checked={state.is_active}
                onCheckedChange={(v) => set("is_active", v)}
                aria-label="Set as active block"
              />
            </div>

            {/* Sticky action bar */}
            <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
              <div className="mx-auto flex w-full max-w-xl gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => onOpenChange(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={pending}>
                  {pending ? (
                    <>
                      <Loader2 className="animate-spin" aria-hidden />
                      Saving
                    </>
                  ) : isEditing ? (
                    "Save changes"
                  ) : (
                    "Create block"
                  )}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  )
}
