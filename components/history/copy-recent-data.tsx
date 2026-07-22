"use client"

import { ClipboardCopy } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

function legacyCopy(text: string): boolean {
  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "")
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand("copy")
  document.body.removeChild(textarea)
  return copied
}

export function CopyRecentData({ text }: { text: string }) {
  async function handleCopy() {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
      else if (!legacyCopy(text)) throw new Error("Copy command was rejected")
      toast.success("Last 14 days copied", {
        description: "Ready to paste into an AI chat.",
      })
    } catch {
      toast.error("Couldn’t copy your data", {
        description: "Your browser may be blocking clipboard access.",
      })
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
      <ClipboardCopy data-icon="inline-start" aria-hidden />
      Copy 14 days
    </Button>
  )
}
