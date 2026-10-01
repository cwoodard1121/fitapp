import { Sparkles } from 'lucide-react'

import type { Unit } from '@/lib/types'
import type { TrainingAnalytics } from '@/lib/analytics/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui'
import {
  WrappedDetailMetric as DetailMetric,
  WrappedStoryMetric as StoryMetric,
  wrappedGrouped as grouped,
} from '@/components/ui/wrapped-recap'

/**
 * A compact, always-visible taste of the "Wrapped" visual language (see
 * components/ui/wrapped-recap.tsx) right on Home — unlike the celebratory
 * block/session recaps, this never pops up as a dialog; it's just a quick
 * highlight tile built from analytics already fetched for this page, so it
 * costs nothing extra to compute.
 */
export function WrappedHighlights({
  analytics,
  unit,
}: {
  analytics: TrainingAnalytics
  unit: Unit
}) {
  const { volume, lifts } = analytics
  if (volume.length === 0) return null

  const totalTonnage = volume.reduce((sum, v) => sum + v.weeklyTonnage, 0)
  const totalSets = volume.reduce((sum, v) => sum + v.weeklySets, 0)
  const trendingUp = lifts.filter((l) => l.trend === 'up').length
  const topMuscle = [...volume].sort((a, b) => b.weeklyTonnage - a.weeklyTonnage)[0]?.muscle ?? '—'

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles className="size-4 text-signal" aria-hidden />
          This week, wrapped
        </CardTitle>
        <CardDescription>A quick highlight reel of this week&apos;s training.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <StoryMetric label={`${unit} moved`} display={grouped(totalTonnage)} />
          <DetailMetric label="working sets" display={grouped(totalSets)} />
          <DetailMetric label="lifts trending up" display={grouped(trendingUp)} />
          <DetailMetric label="top muscle" display={topMuscle} />
        </div>
      </CardContent>
    </Card>
  )
}
