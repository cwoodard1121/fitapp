"use client"

import type { ReactNode } from "react"
import {
  Activity,
  CalendarDays,
  Dumbbell,
  Footprints,
  Salad,
  Scale,
} from "lucide-react"

import type { Block, Unit } from "@/lib/types"
import type { BlockStats } from "@/lib/blocks/stats"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Stat } from "@/components/ui/stat"
import { formatRange, phaseLabel } from "@/components/blocks/utils"

interface BlockStatsDialogProps {
  block: Block | null
  stats: BlockStats | null
  unit: Unit
  onOpenChange: (open: boolean) => void
}

function rounded(value: number | null, precision = 1): number | null {
  return value == null ? null : Number(value.toFixed(precision))
}

function signed(value: number | null, precision = 1): string | null {
  if (value == null) return null
  const fixed = value.toFixed(precision)
  return value > 0 ? `+${fixed}` : fixed
}

function grouped(value: number): string {
  return Math.round(value).toLocaleString()
}

function Metric({
  label,
  value,
  unit,
  tone,
}: {
  label: string
  value: number | string | null
  unit?: string
  tone?: "default" | "signal" | "green" | "yellow" | "red"
}) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-background/35 p-3">
      <Stat
        label={label}
        value={value}
        unit={unit}
        size="sm"
        tone={tone}
        labelClassName="leading-tight"
        valueClassName="break-words"
      />
    </div>
  )
}

function StatsSection({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="text-signal">{icon}</span>
          {title}
        </h3>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{children}</div>
    </section>
  )
}

export function BlockStatsDialog({
  block,
  stats,
  unit,
  onOpenChange,
}: BlockStatsDialogProps) {
  if (!block || !stats) return null

  const phase = phaseLabel(block.kind, block.phase)
  const training = stats.training
  const activity = stats.activity
  const nutrition = stats.nutrition
  const body = stats.body

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="pr-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="signal">Block stats</Badge>
            <Badge variant="outline">
              {block.kind === "training" ? "Training block" : "Diet block"}
            </Badge>
            {phase ? <Badge variant="muted">{phase}</Badge> : null}
          </div>
          <DialogTitle>{block.name}</DialogTitle>
          <DialogDescription>{formatRange(block)}</DialogDescription>
        </DialogHeader>

        {stats.status === "undated" ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center">
            <CalendarDays className="mx-auto size-5 text-muted" aria-hidden />
            <p className="mt-2 text-sm font-medium">No date window yet</p>
            <p className="mt-1 text-xs text-muted">
              Add a start date to calculate block-specific stats.
            </p>
          </div>
        ) : stats.status === "upcoming" ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center">
            <CalendarDays className="mx-auto size-5 text-signal" aria-hidden />
            <p className="mt-2 text-sm font-medium">This block has not started</p>
            <p className="mt-1 text-xs text-muted">
              Stats will begin accumulating on {block.start_date}.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <StatsSection
              icon={<Activity className="size-4" aria-hidden />}
              title="Coverage"
              description="Elapsed block time and days with at least one training, steps, nutrition, or body entry."
            >
              <Metric label="Days observed" value={stats.observedDays} tone="signal" />
              <Metric label="Started weeks" value={stats.observedWeeks} />
              <Metric label="Days with data" value={stats.dataDays} />
            </StatsSection>

            <StatsSection
              icon={<Dumbbell className="size-4" aria-hidden />}
              title="Training"
              description={
                block.kind === "training" && block.program_id
                  ? "Completed sessions from this block's linked program."
                  : "All completed training sessions inside this block's date window."
              }
            >
              <Metric
                label="Avg training days/wk"
                value={rounded(training.avgTrainingDaysPerWeek)}
                tone="signal"
              />
              <Metric label="Training days" value={training.trainingDays} />
              <Metric label="Sessions" value={training.sessions} />
              <Metric label="Exercises trained" value={training.exerciseCount} />
              <Metric label="Working sets" value={training.workingSets} />
              <Metric
                label="Sets/session"
                value={rounded(training.avgSetsPerSession)}
              />
              <Metric
                label="Sets/training day"
                value={rounded(training.avgSetsPerTrainingDay)}
              />
              <Metric label="Total reps" value={grouped(training.totalReps)} />
              <Metric
                label="Reps/set"
                value={rounded(training.avgRepsPerSet)}
              />
              <Metric
                label="Total volume"
                value={grouped(training.totalVolume)}
                unit={unit}
              />
              <Metric
                label="Volume/session"
                value={
                  training.avgVolumePerSession == null
                    ? null
                    : grouped(training.avgVolumePerSession)
                }
                unit={unit}
              />
              <Metric label="Avg set RIR" value={rounded(training.avgRir)} />
            </StatsSection>

            <StatsSection
              icon={<Footprints className="size-4" aria-hidden />}
              title="Steps"
              description={`Completed-day activity inside the block. Baseline is ${activity.stepBaseline.toLocaleString()} steps/day.`}
            >
              <Metric label="Days with steps" value={activity.daysLogged} />
              <Metric
                label="Step coverage"
                value={rounded(activity.coveragePct, 0)}
                unit="%"
              />
              <Metric
                label="Avg steps/day"
                value={
                  activity.avgSteps == null ? null : grouped(activity.avgSteps)
                }
                tone="signal"
              />
              <Metric
                label="Total steps"
                value={grouped(activity.totalSteps)}
              />
              <Metric
                label="Lowest day"
                value={
                  activity.minSteps == null ? null : grouped(activity.minSteps)
                }
              />
              <Metric
                label="Highest day"
                value={
                  activity.maxSteps == null ? null : grouped(activity.maxSteps)
                }
              />
              <Metric
                label="Avg vs baseline"
                value={signed(activity.avgStepsVsBaseline, 0)}
                unit="steps"
              />
              <Metric
                label="Baseline hit"
                value={rounded(activity.baselineHitPct, 0)}
                unit="%"
              />
              <Metric
                label="Step baseline"
                value={grouped(activity.stepBaseline)}
              />
            </StatsSection>

            <StatsSection
              icon={<Salad className="size-4" aria-hidden />}
              title="Nutrition"
              description="Daily averages, logging consistency, and target hit rates. Calories count as on target within ±10%; protein counts at or above target."
            >
              <Metric label="Days logged" value={nutrition.daysLogged} />
              <Metric
                label="Logging coverage"
                value={rounded(nutrition.coveragePct, 0)}
                unit="%"
              />
              <Metric
                label="Avg kcal/day"
                value={rounded(nutrition.avgCalories, 0)}
                tone="signal"
              />
              <Metric
                label="Avg protein/day"
                value={rounded(nutrition.avgProtein, 0)}
                unit="g"
              />
              <Metric
                label="Avg carbs/day"
                value={rounded(nutrition.avgCarbs, 0)}
                unit="g"
              />
              <Metric
                label="Avg fat/day"
                value={rounded(nutrition.avgFat, 0)}
                unit="g"
              />
              <Metric
                label="Avg kcal vs target"
                value={signed(nutrition.avgCaloriesVsTarget, 0)}
                unit="kcal"
              />
              <Metric
                label="Avg protein vs target"
                value={signed(nutrition.avgProteinVsTarget, 0)}
                unit="g"
              />
              <Metric
                label="Kcal target hit"
                value={rounded(nutrition.calorieTargetHitPct, 0)}
                unit="%"
              />
              <Metric
                label="Protein target hit"
                value={rounded(nutrition.proteinTargetHitPct, 0)}
                unit="%"
              />
              <Metric
                label="Kcal variability"
                value={
                  nutrition.calorieStdDev == null
                    ? null
                    : `±${Math.round(nutrition.calorieStdDev)}`
                }
                unit="kcal"
              />
              <Metric
                label="Longest log streak"
                value={nutrition.longestLoggingStreak}
                unit="days"
              />
            </StatsSection>

            <StatsSection
              icon={<Scale className="size-4" aria-hidden />}
              title="Body"
              description="First-to-last change and average pace from check-ins inside the block."
            >
              <Metric label="Body check-ins" value={body.checkIns} />
              <Metric label="Weight check-ins" value={body.weightCheckIns} />
              <Metric
                label="Starting weight"
                value={rounded(body.startWeight)}
                unit={unit}
              />
              <Metric
                label="Ending weight"
                value={rounded(body.endWeight)}
                unit={unit}
                tone="signal"
              />
              <Metric
                label="Avg weight"
                value={rounded(body.avgWeight)}
                unit={unit}
              />
              <Metric
                label="Weight change"
                value={signed(body.weightChange)}
                unit={unit}
              />
              <Metric
                label="Weight rate/wk"
                value={signed(body.weightRatePerWeek, 2)}
                unit={unit}
              />
              <Metric label="Body-fat check-ins" value={body.bodyfatCheckIns} />
              <Metric
                label="Starting body fat"
                value={rounded(body.startBodyfat)}
                unit="%"
              />
              <Metric
                label="Ending body fat"
                value={rounded(body.endBodyfat)}
                unit="%"
              />
              <Metric
                label="Avg body fat"
                value={rounded(body.avgBodyfat)}
                unit="%"
              />
              <Metric
                label="Body-fat change"
                value={signed(body.bodyfatChange)}
                unit="pts"
              />
            </StatsSection>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
