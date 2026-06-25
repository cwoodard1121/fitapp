import { Sparkles } from 'lucide-react'

/**
 * "Coach — focus today" nudge surfaced on the Today page, fed by the cached AI
 * overview's focus bullets. Renders nothing when there is no focus to show.
 */
export function AnalysisFocus({ focus }: { focus: string[] }) {
  const items = focus.filter((f) => f.trim().length > 0).slice(0, 3)
  if (items.length === 0) return null

  return (
    <div className="rounded-lg border border-signal/30 bg-signal/5 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex size-6 items-center justify-center rounded-md bg-signal/15 text-signal">
          <Sparkles className="size-3.5" aria-hidden />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-foreground">Coach</p>
          <p className="text-[11px] font-medium uppercase tracking-wider text-signal">
            Focus today
          </p>
        </div>
      </div>
      <ul className="space-y-1.5">
        {items.map((f, i) => (
          <li key={i} className="flex gap-2 text-sm leading-snug text-foreground">
            <span className="mt-px text-signal" aria-hidden>
              •
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
