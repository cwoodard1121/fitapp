import { DecisionBadge } from "@/components/ui/decision-badge"
import { Stat } from "@/components/ui/stat"
import { Separator } from "@/components/ui/separator"
import { Sparkline } from "@/components/history/sparkline"
import { cn } from "@/lib/utils"
import type { SlotView, Unit } from "@/lib/types"
import type { Gate } from "@/lib/engine/engine"

const gateText: Record<Gate, string> = {
  Green: "text-gate-green",
  Yellow: "text-gate-yellow",
  Red: "text-gate-red",
}

const gateDot: Record<Gate, string> = {
  Green: "bg-gate-green",
  Yellow: "bg-gate-yellow",
  Red: "bg-gate-red",
}

function RatingChip({
  label,
  value,
  tone = "default",
}: {
  label: string
  value: string | number | null | undefined
  tone?: "default" | "green" | "yellow" | "red"
}) {
  const has = value !== null && value !== undefined && value !== ""
  const toneText =
    tone === "green"
      ? "text-gate-green"
      : tone === "yellow"
        ? "text-gate-yellow"
        : tone === "red"
          ? "text-gate-red"
          : "text-foreground"
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border bg-background px-2.5 py-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted">
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-sm font-semibold tabular-nums",
          has ? toneText : "text-muted"
        )}
      >
        {has ? value : "—"}
      </span>
    </div>
  )
}

function recoveryTone(v: number | null) {
  if (v == null) return "default" as const
  if (v >= 7) return "green" as const
  if (v <= 4) return "red" as const
  return "yellow" as const
}

export function SlotReadout({
  view,
  unit,
  e1rmSeries,
}: {
  view: SlotView
  unit: Unit
  e1rmSeries: number[]
}) {
  const { slot, log, entries, result } = view
  const aggLogged =
    log != null &&
    (log.actual_load != null ||
      log.best_reps != null ||
      log.actual_sets != null ||
      log.actual_rir != null)
  const logged = entries.length > 0 || aggLogged

  return (
    <div className="rounded-lg border border-border bg-surface">
      {/* Header: exercise + the engine's call */}
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
              {slot.slot_code}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[11px] font-medium",
                gateText[result.gate]
              )}
            >
              <span
                className={cn("h-1.5 w-1.5 rounded-full", gateDot[result.gate])}
                aria-hidden
              />
              {result.gate}
            </span>
          </div>
          <h3 className="truncate text-base font-semibold text-foreground">
            {slot.exercise_name}
          </h3>
          {slot.muscle_area ? (
            <p className="text-xs text-muted">{slot.muscle_area}</p>
          ) : null}
        </div>
        <DecisionBadge
          decision={result.decision}
          label={result.decisionLabel}
          reason={result.reason}
          className="max-w-[55%] text-right [&>span:last-child]:text-right"
        />
      </div>

      <Separator />

      {/* The sets the user actually did */}
      {entries.length > 0 ? (
        <div className="p-4">
          <div className="grid grid-cols-[1.75rem_1fr_1fr_1fr] gap-1.5 px-0.5 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted">
            <span className="text-center">#</span>
            <span className="text-center">Load</span>
            <span className="text-center">Reps</span>
            <span className="text-center">RIR</span>
          </div>
          <div className="space-y-1">
            {entries.map((e, i) => (
              <div
                key={e.id}
                className="grid grid-cols-[1.75rem_1fr_1fr_1fr] items-center gap-1.5 rounded-md border border-border bg-background px-0.5 py-1.5 font-mono text-sm font-semibold tabular-nums"
              >
                <span className="text-center text-muted">{i + 1}</span>
                <span className="text-center">
                  {e.load ?? "—"}
                  {e.load != null ? (
                    <span className="ml-0.5 text-[0.7em] font-normal text-muted">
                      {unit}
                    </span>
                  ) : null}
                </span>
                <span className="text-center">{e.reps ?? "—"}</span>
                <span className="text-center text-muted">{e.rir ?? "—"}</span>
              </div>
            ))}
          </div>
        </div>
      ) : aggLogged ? (
        <div className="grid grid-cols-4 gap-2 p-4">
          <Stat label="Load" value={log?.actual_load ?? null} unit={unit} size="sm" />
          <Stat label="Reps" value={log?.best_reps ?? null} size="sm" />
          <Stat label="Sets" value={log?.actual_sets ?? null} size="sm" />
          <Stat
            label="RIR"
            value={log?.actual_rir ?? null}
            size="sm"
            tone={result.hitRir === "Y" ? "green" : "default"}
          />
        </div>
      ) : (
        <div className="p-4">
          <p className="text-sm text-muted">No set logged for this slot.</p>
        </div>
      )}

      {/* Derived metrics + e1RM trajectory */}
      {logged && (result.e1rm != null || result.tonnage != null) ? (
        <div className="flex items-end justify-between gap-3 px-4 pb-4">
          <div className="flex items-end gap-5">
            <Stat
              label="e1RM"
              value={result.e1rm}
              unit={unit}
              precision={1}
              size="sm"
              tone="signal"
            />
            <Stat
              label="Tonnage"
              value={result.tonnage}
              unit={unit}
              size="sm"
            />
          </div>
          {e1rmSeries.length >= 2 ? (
            <Sparkline values={e1rmSeries} className="mb-1" />
          ) : null}
        </div>
      ) : null}

      {/* Readiness ratings */}
      {logged ? (
        <div className="border-t border-border p-4">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted">
            Readiness
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            <RatingChip label="Pump" value={log?.pump ?? null} />
            <RatingChip label="Enjoy" value={log?.enjoyment ?? null} />
            <RatingChip label="Sore" value={log?.soreness ?? null} />
            <RatingChip
              label="Recover"
              value={log?.recovery ?? null}
              tone={recoveryTone(log?.recovery ?? null)}
            />
            <RatingChip label="Perf" value={log?.performance ?? null} />
          </div>
          {log?.notes ? (
            <p className="mt-3 rounded-md border border-border bg-background p-2.5 text-sm text-muted">
              {log.notes}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
