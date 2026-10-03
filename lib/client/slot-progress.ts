/**
 * Tiny client-side channel so the session rail can fill a slot's segment the
 * instant a rep is typed, before the save round-trip refreshes server data.
 */
const EVENT = 'sg:slot-progress'

export interface SlotProgressDetail {
  slotId: string
  performedSets: number
}

export function announceSlotProgress(detail: SlotProgressDetail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<SlotProgressDetail>(EVENT, { detail }))
}

export function onSlotProgress(
  handler: (detail: SlotProgressDetail) => void,
): () => void {
  const listener = (e: Event) =>
    handler((e as CustomEvent<SlotProgressDetail>).detail)
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}
