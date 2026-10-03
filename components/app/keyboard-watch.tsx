"use client"

import { useEffect } from "react"

/** Fields that raise a text keyboard (not toggles, sliders or buttons). */
const TYPING =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="reset"]), textarea, select, [contenteditable=""], [contenteditable="true"]'
/** A gap smaller than this is browser chrome or rounding, not a keyboard. */
const MIN_KEYBOARD = 120

/**
 * Marks <html data-keyboard="open"> while the on-screen keyboard is up, and
 * publishes its height as --keyboard-inset.
 *
 * Why: iOS and Android Chrome don't shrink the layout viewport for the
 * keyboard. They shrink the visual viewport and pan it up to the focused
 * field. Fixed bottom bars belong to the layout viewport, so during that pan
 * the tab bar and the finish-session bar ride up into the middle of the
 * screen. globals.css hides [data-keyboard-hide] chrome in this state and
 * pads <main> so fields scroll above the keyboard instead of panning.
 */
export function KeyboardWatch() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement
    let open = false
    let timer: number | undefined

    const update = () => {
      // clientHeight is the layout viewport; the keyboard never changes it.
      // Scaling the visual height removes pinch-zoom from the comparison.
      const gap = root.clientHeight - vv.height * vv.scale
      const typing = document.activeElement?.matches(TYPING) ?? false
      // Enter only while typing; leave only once the keyboard has gone, so
      // the bars don't flash mid-screen while it animates away.
      const next = gap > MIN_KEYBOARD && (typing || open)
      if (next) root.style.setProperty("--keyboard-inset", `${Math.round(gap)}px`)
      if (next === open) return
      open = next
      if (open) {
        root.dataset.keyboard = "open"
      } else {
        delete root.dataset.keyboard
        root.style.removeProperty("--keyboard-inset")
        // The shell never scrolls the window, but iOS can leave it panned
        // after the keyboard closes. Put it back.
        if (window.scrollY !== 0) window.scrollTo(0, 0)
      }
    }
    const later = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(update, 60)
    }

    vv.addEventListener("resize", update)
    vv.addEventListener("scroll", update)
    document.addEventListener("focusin", update)
    document.addEventListener("focusout", later)
    update()
    return () => {
      window.clearTimeout(timer)
      vv.removeEventListener("resize", update)
      vv.removeEventListener("scroll", update)
      document.removeEventListener("focusin", update)
      document.removeEventListener("focusout", later)
      delete root.dataset.keyboard
      root.style.removeProperty("--keyboard-inset")
    }
  }, [])

  return null
}
