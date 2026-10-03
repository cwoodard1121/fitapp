import { cn } from '@/lib/utils'

export interface BandSegment {
  slotId: string
  code: string
  name: string
  logged: boolean
}

/**
 * The session band: one segment per exercise slot, filled as it gets logged.
 * Each segment jumps to its slot. Reads like the stripe bands of the venue
 * signage, and doubles as the session's progress.
 */
export function SessionBand({
  segments,
  done,
}: {
  segments: BandSegment[]
  done: boolean
}) {
  if (segments.length === 0) return null
  const logged = segments.filter((s) => s.logged).length

  return (
    <nav aria-label="Exercises in this session">
      <ol className="flex gap-1">
        {segments.map((s) => (
          <li key={s.slotId} className="min-w-0 flex-1">
            <a
              href={`#slot-${s.slotId}`}
              aria-label={`${s.name}${s.logged ? ', logged' : ''}`}
              className="group flex h-11 select-none flex-col justify-start gap-1.5 rounded-sm pt-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            >
              <span
                aria-hidden
                className={cn(
                  'block h-2.5 rounded-[3px] transition-colors duration-200 group-active:opacity-70',
                  s.logged
                    ? done
                      ? 'bg-gate-green'
                      : 'bg-signal'
                    : 'bg-foreground/[0.09]',
                )}
              />
              <span
                className={cn(
                  'truncate text-center font-mono text-[0.6875rem] font-bold leading-none',
                  s.logged ? 'text-foreground' : 'text-muted',
                )}
              >
                {s.code}
              </span>
            </a>
          </li>
        ))}
      </ol>
      <p className="sr-only">
        {logged} of {segments.length} exercises logged
      </p>
    </nav>
  )
}
