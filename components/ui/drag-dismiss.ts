'use client'

import * as React from 'react'

/** Controls that own their own vertical gestures never start a sheet drag. */
const NO_DRAG = 'input, textarea, select, [role="slider"], [data-no-drag]'
const SETTLE_MS = 240

/**
 * Lets a bottom sheet follow the finger down and close when flung or pulled
 * far enough — the way a native sheet does. A drag only begins when the touch
 * moves downward and nothing under it is scrolled, so lists inside the sheet
 * keep scrolling normally. Closing hands off to Radix through `dismiss`; its
 * exit animation picks up from wherever the finger left the sheet.
 */
function attachDragDismiss(
  el: HTMLElement,
  dismiss: () => void,
  media?: string,
): () => void {
  let state: 'idle' | 'pending' | 'dragging' = 'idle'
  let startX = 0
  let startY = 0
  let lastY = 0
  let lastT = 0
  let velocity = 0
  let overlay: HTMLElement | null = null

  const scrolledAbove = (target: Element) => {
    for (let n: Element | null = target; n; n = n.parentElement) {
      if (n.scrollTop > 0) return true
      if (n === el) break
    }
    return false
  }

  const onStart = (e: TouchEvent) => {
    state = 'idle'
    if (e.touches.length !== 1) return
    if (media && !window.matchMedia(media).matches) return
    const target = e.target
    if (!(target instanceof Element)) return
    if (target.closest(NO_DRAG) || scrolledAbove(target)) return
    const t = e.touches[0]
    state = 'pending'
    startX = t.clientX
    startY = lastY = t.clientY
    lastT = e.timeStamp
    velocity = 0
  }

  const onMove = (e: TouchEvent) => {
    if (state === 'idle') return
    const t = e.touches[0]
    const dy = t.clientY - startY
    const dx = t.clientX - startX
    if (state === 'pending') {
      if (dy < 0 || Math.abs(dx) > Math.abs(dy)) {
        state = 'idle'
        return
      }
      if (dy === 0) return
      state = 'dragging'
      const prev = el.previousElementSibling
      overlay =
        prev instanceof HTMLElement && prev.hasAttribute('data-state') ? prev : null
      el.style.transition = 'none'
      if (overlay) overlay.style.transition = 'none'
    }
    if (e.cancelable) e.preventDefault()
    const offset = Math.max(0, dy)
    el.style.transform = `translate3d(0, ${offset}px, 0)`
    if (overlay) {
      overlay.style.opacity = String(Math.max(0, 1 - offset / (el.offsetHeight || 1)))
    }
    const dt = e.timeStamp - lastT
    if (dt > 0) velocity = (t.clientY - lastY) / dt
    lastY = t.clientY
    lastT = e.timeStamp
  }

  const onEnd = () => {
    if (state !== 'dragging') {
      state = 'idle'
      return
    }
    state = 'idle'
    const offset = Math.max(0, lastY - startY)
    const flung = velocity > 0.5 && offset > 24
    if (flung || offset > Math.min(140, el.offsetHeight * 0.35)) {
      el.style.transition = ''
      if (overlay) overlay.style.transition = ''
      dismiss()
      return
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.style.transition = reduce
      ? 'none'
      : `transform ${SETTLE_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`
    el.style.transform = ''
    const ov = overlay
    if (ov) {
      ov.style.transition = reduce ? 'none' : `opacity ${SETTLE_MS}ms ease-out`
      ov.style.opacity = ''
    }
    window.setTimeout(() => {
      el.style.transition = ''
      if (ov) ov.style.transition = ''
    }, SETTLE_MS + 20)
  }

  el.addEventListener('touchstart', onStart, { passive: true })
  el.addEventListener('touchmove', onMove, { passive: false })
  el.addEventListener('touchend', onEnd)
  el.addEventListener('touchcancel', onEnd)
  return () => {
    el.removeEventListener('touchstart', onStart)
    el.removeEventListener('touchmove', onMove)
    el.removeEventListener('touchend', onEnd)
    el.removeEventListener('touchcancel', onEnd)
  }
}

/**
 * Returns a ref for a sheet's content element that wires drag-to-dismiss,
 * merged with the caller's forwarded ref. `closeRef` points at the sheet's
 * own Close button so dismissal runs through Radix's normal close path.
 */
export function useDragDismissRef<T extends HTMLElement>(
  forwarded: React.Ref<T> | undefined,
  closeRef: React.RefObject<HTMLElement | null>,
  { enabled = true, media }: { enabled?: boolean; media?: string } = {},
): React.RefCallback<T> {
  return React.useCallback(
    (node: T | null) => {
      if (typeof forwarded === 'function') forwarded(node)
      else if (forwarded) forwarded.current = node
      const detach =
        node && enabled
          ? attachDragDismiss(node, () => closeRef.current?.click(), media)
          : undefined
      return () => {
        detach?.()
        if (typeof forwarded === 'function') forwarded(null)
        else if (forwarded) forwarded.current = null
      }
    },
    [forwarded, closeRef, enabled, media],
  )
}
