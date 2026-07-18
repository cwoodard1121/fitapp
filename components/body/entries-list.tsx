'use client'

import * as React from 'react'
import { useTransition } from 'react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { Loader2, MoreVertical, Pencil, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { BodyMetric, Unit } from '@/lib/types'
import { buildBodyFatInterpretations } from '@/lib/body/body-fat'
import { deleteBodyMetric } from '@/app/(app)/body/actions'

interface EntriesListProps {
  /** Descending by measured_on (most recent first). */
  entries: BodyMetric[]
  unit: Unit
  onEdit: (entry: BodyMetric) => void
}

export function EntriesList({ entries, unit, onEdit }: EntriesListProps) {
  const [pendingDelete, setPendingDelete] = React.useState<BodyMetric | null>(null)
  const [isDeleting, startDelete] = useTransition()
  const interpretationByDate = React.useMemo(
    () =>
      new Map(
        buildBodyFatInterpretations(entries).map((point) => [point.date, point]),
      ),
    [entries],
  )

  function confirmDelete() {
    const entry = pendingDelete
    if (!entry) return
    startDelete(async () => {
      const res = await deleteBodyMetric(entry.id)
      if (res.ok) {
        toast.success('Weigh-in deleted.')
        setPendingDelete(null)
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <>
      <ul className="divide-y divide-border">
        {entries.map((e) => (
          <li
            key={e.id}
            className="flex min-h-12 items-center gap-3 py-2"
          >
            <div className="w-28 shrink-0 font-mono text-xs tabular-nums text-muted">
              {format(parseISO(e.measured_on), 'EEE, MMM d')}
            </div>
            <div className="font-mono tabular-nums text-foreground">
              {e.bodyweight != null ? e.bodyweight.toFixed(1) : '—'}
              <span className="ml-0.5 text-xs text-muted">{unit}</span>
            </div>
            <div className="font-mono tabular-nums text-muted">
              {interpretationByDate.get(e.measured_on)?.bodyfatPct != null ? (
                <>
                  {interpretationByDate.get(e.measured_on)!.bodyfatPct!.toFixed(1)}
                  <span className="ml-0.5 text-xs">%</span>
                </>
              ) : (
                <span className="text-xs">— %</span>
              )}
            </div>
            {e.notes ? (
              <div className="hidden flex-1 truncate text-xs text-muted sm:block">
                {e.notes}
              </div>
            ) : (
              <div className="flex-1" />
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-muted"
                  aria-label={`Edit or delete ${format(parseISO(e.measured_on), 'MMM d')} weigh-in`}
                >
                  <MoreVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onEdit(e)}>
                  <Pencil />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setPendingDelete(e)}
                  className="text-gate-red focus:text-gate-red"
                >
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ))}
      </ul>

      <Dialog
        open={pendingDelete != null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this weigh-in?</DialogTitle>
            <DialogDescription>
              {pendingDelete
                ? `${format(parseISO(pendingDelete.measured_on), 'EEEE, MMM d')} · ${
                    pendingDelete.bodyweight?.toFixed(1) ?? '—'
                  } ${unit}. This can't be undone.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingDelete(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
