'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Input,
  Label,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui'
import { resetAccount } from '@/app/(app)/settings/actions'

const CONFIRM_WORD = 'RESET'

/**
 * Destructive "reset account" control. Deletes every row the user owns and
 * reseeds the default program. Gated behind a dialog that requires typing the
 * confirm word, since the action is irreversible.
 */
export function ResetAccount() {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [pending, startTransition] = useTransition()

  const armed = confirm.trim().toUpperCase() === CONFIRM_WORD

  function onReset() {
    if (!armed) return
    startTransition(async () => {
      const res = await resetAccount()
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setOpen(false)
      setConfirm('')
      toast.success('Account reset — back to a fresh default program.')
    })
  }

  return (
    <Card className="border-gate-red/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-gate-red">
          <AlertTriangle className="size-4" aria-hidden />
          Reset account
        </CardTitle>
        <CardDescription>
          Permanently delete all of your data — every program, logged session,
          set, block, goal, body metric and nutrition entry — and start over
          from the default program. This cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted">
          Your sign-in stays intact; only your data is wiped. You&rsquo;ll land
          on a fresh copy of the default program, just like a new account.
        </p>
      </CardContent>
      <CardFooter className="justify-end">
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v)
            if (!v) setConfirm('')
          }}
        >
          <DialogTrigger asChild>
            <Button type="button" variant="destructive">
              <AlertTriangle className="size-4" aria-hidden />
              Reset account
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset your account?</DialogTitle>
              <DialogDescription>
                This deletes <strong>everything</strong> — programs, sessions,
                sets, blocks, goals, body metrics and nutrition logs — and
                reseeds the default program. There is no undo.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="reset-confirm">
                Type{' '}
                <span className="font-mono text-foreground">{CONFIRM_WORD}</span>{' '}
                to confirm
              </Label>
              <Input
                id="reset-confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && armed && !pending) onReset()
                }}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder={CONFIRM_WORD}
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={pending}>
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="button"
                variant="destructive"
                onClick={onReset}
                disabled={!armed || pending}
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="size-4" aria-hidden />
                )}
                Delete everything
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  )
}
