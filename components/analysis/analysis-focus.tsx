import { Sparkles } from 'lucide-react'

/**
 * Slim "focus next" nudge surfaced on the Today page, fed by the cached AI
 * overview's focus bullets. Renders nothing when there is no focus to show.
 */
export function AnalysisFocus({ focus }: { focus: string[] }) {
  const items = focus.filter((f) => f.trim().length > 0).slice(0, 3)
  if (items.length === 0) return null

  return (
    <div className="rounded-md border border-signal/30 bg-signal/5 p-3">
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-signal">
        <Sparkles className="size-3.5" aria-hidden />
        Focus today
      </p>
      <ul className="space-y-1">
        {items.map((f, i) => (
          <li key={i} className="flex gap-2 text-sm text-foreground">
            <span className="text-signal" aria-hidden>
              •
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
