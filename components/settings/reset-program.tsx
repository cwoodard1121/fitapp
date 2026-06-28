'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, RotateCcw } from 'lucide-react'

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui'
import { resetToDefaultProgram } from '@/app/(app)/settings/actions'

/**
 * Non-destructive "set program to default": loads a fresh copy of the current
 * built-in program and makes it active. Keeps ALL logged history (sessions,
 * sets, body metrics, goals, nutrition) — the previous program is left in the
 * program switcher, nothing is deleted.
 */
export function ResetProgram() {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function onReset() {
    startTransition(async () => {
      const res = await resetToDefaultProgram()
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setOpen(false)
      toast.success('Program set to the default — your history is untouched.')
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set program to default</CardTitle>
        <CardDescription>
          Load a fresh copy of the latest built-in program and make it your
          active program. Your logged sets, sessions, body metrics, goals and
          nutrition history are all kept — nothing is deleted.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted">
          Use this to adopt the newest default split, or to start clean if
          you&rsquo;ve edited your program into a corner. Your previous program
          stays available in the program switcher.
        </p>
      </CardContent>
      <CardFooter className="justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button type="button">
              <RotateCcw className="size-4" aria-hidden />
              Set program to default
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Set your program to the default?</DialogTitle>
              <DialogDescription>
                This loads a fresh copy of the current default program and makes
                it active. Your current program and all logged history are
                kept&nbsp;— nothing is deleted, and you can switch back any time
                from the program switcher.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={pending}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="button" onClick={onReset} disabled={pending}>
                {pending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <RotateCcw className="size-4" aria-hidden />
                )}
                Set to default
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  )
}
