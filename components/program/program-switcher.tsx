'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Plus, Star, Trash2 } from 'lucide-react'

import type { Program } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  createProgramAction,
  setActiveProgramAction,
  deleteProgramAction,
} from '@/app/(app)/program/actions'

type Busy = null | 'activate' | 'delete' | 'create'

/**
 * Program manager for the editor header: switch WHICH program you're editing
 * (independent of which is active for training), create a new one (blank or from
 * the starter template), set the edited program active, or delete it.
 */
export function ProgramSwitcher({
  programs,
  currentId,
  activeId,
}: {
  programs: Program[]
  currentId: string
  activeId: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = React.useState<Busy>(null)
  const [newOpen, setNewOpen] = React.useState(false)
  const [delOpen, setDelOpen] = React.useState(false)
  const [name, setName] = React.useState('')
  const [template, setTemplate] = React.useState<'blank' | 'starter'>('blank')

  const isActive = currentId === activeId

  function switchEdit(id: string) {
    if (id === currentId) return
    router.push(`/program?p=${id}`)
  }

  async function activate() {
    setBusy('activate')
    const res = await setActiveProgramAction({ programId: currentId })
    setBusy(null)
    if (res.ok) {
      toast.success('Set as your active program.')
      router.refresh()
    } else {
      toast.error(res.error)
    }
  }

  async function create() {
    if (!name.trim()) {
      toast.error('Name your program.')
      return
    }
    setBusy('create')
    const res = await createProgramAction({ name: name.trim(), template })
    setBusy(null)
    if (res.ok) {
      setNewOpen(false)
      setName('')
      setTemplate('blank')
      toast.success('Program created.')
      router.push(`/program?p=${res.data.id}`)
    } else {
      toast.error(res.error)
    }
  }

  async function remove() {
    setBusy('delete')
    const res = await deleteProgramAction({ programId: currentId })
    setBusy(null)
    if (res.ok) {
      setDelOpen(false)
      toast.success('Program deleted.')
      router.push('/program')
    } else {
      toast.error(res.error)
    }
  }

  return (
    <Card className="mb-4">
      <CardContent className="flex flex-wrap items-center gap-2 p-3">
        <Select value={currentId} onValueChange={switchEdit}>
          <SelectTrigger className="h-9 w-full min-w-0 flex-1 sm:max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {programs.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
                {p.id === activeId ? ' · active' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isActive ? (
          <Badge variant="success" className="gap-1">
            <Star className="size-3" aria-hidden />
            Active
          </Badge>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={activate}
            disabled={busy !== null}
            className="gap-1.5"
          >
            {busy === 'activate' ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Star className="size-3.5" aria-hidden />
            )}
            Set active
          </Button>
        )}

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setNewOpen(true)}
          className="gap-1.5"
        >
          <Plus className="size-3.5" aria-hidden />
          New
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setDelOpen(true)}
          disabled={busy !== null}
          aria-label="Delete this program"
          className="text-muted hover:text-gate-red"
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </CardContent>

      {/* New program dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New program</DialogTitle>
            <DialogDescription>
              Create another program to switch between. It won&apos;t become active
              until you set it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-program-name">Name</Label>
              <Input
                id="new-program-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Strength block"
                maxLength={80}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') create()
                }}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Start from</Label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { v: 'blank', label: 'Blank', hint: 'One empty day' },
                    { v: 'starter', label: 'Starter', hint: 'Full template' },
                  ] as const
                ).map((o) => {
                  const active = template === o.v
                  return (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => setTemplate(o.v)}
                      aria-pressed={active}
                      className={cn(
                        'flex flex-col items-start gap-0.5 rounded-md border p-3 text-left transition-colors',
                        active
                          ? 'border-signal bg-signal/10'
                          : 'border-border bg-background hover:bg-surface',
                      )}
                    >
                      <span className="text-sm font-medium">{o.label}</span>
                      <span className="text-xs text-muted">{o.hint}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setNewOpen(false)}
              disabled={busy === 'create'}
            >
              Cancel
            </Button>
            <Button type="button" onClick={create} disabled={busy === 'create'}>
              {busy === 'create' ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={delOpen} onOpenChange={setDelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this program?</DialogTitle>
            <DialogDescription>
              This permanently deletes the program and all of its logged sessions
              and sets. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDelOpen(false)}
              disabled={busy === 'delete'}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={remove}
              disabled={busy === 'delete'}
              className="bg-gate-red text-white hover:bg-gate-red/90"
            >
              {busy === 'delete' ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="size-4" aria-hidden />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
