"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RotateCcw, Loader2 } from "lucide-react"
import { toast } from "sonner"

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui"
import { restartCurrentBlock } from "@/app/(app)/blocks/actions"
import { TAP_SCALE } from "@/lib/utils"

/**
 * "Restart current block" — re-anchors the active program's week counter and
 * the active blocks' own timelines to today, and starts a fresh maintenance
 * calibration. A quick way to stop being stuck on week 5 after taking time
 * off, without losing any logged history.
 */
export function RestartBlockDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function onConfirm() {
    startTransition(async () => {
      const res = await restartCurrentBlock()
      if (res.ok) {
        toast.success("Restarted — week 1, fresh maintenance calibration.")
        setOpen(false)
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={TAP_SCALE}
        onClick={() => setOpen(true)}
      >
        <RotateCcw aria-hidden />
        Restart
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Restart your current block?</DialogTitle>
            <DialogDescription>
              Use this after time off, so you&apos;re not stuck on week 5.
              This resets your program back to week 1, restarts your active
              training/diet block timelines, and begins a fresh maintenance
              calibration. Nothing is deleted — every logged set, weigh-in,
              and meal stays in your history exactly as it is.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="button" onClick={onConfirm} disabled={pending}>
              {pending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <RotateCcw aria-hidden />
              )}
              {pending ? "Restarting..." : "Restart from today"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
