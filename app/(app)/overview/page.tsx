import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Activity } from 'lucide-react'

import { getProfile, getPrograms, requireUserId } from '@/lib/data'
import { createClient } from '@/lib/supabase/server'
import { getAnalysisAccess } from '@/lib/ai/allowlist'
import { getAnalyticsAndAnalysis } from '@/lib/ai/analysis'
import { getRecoveryRange } from '@/lib/wearables/store'
import type { RecoveryMetric, Unit } from '@/lib/types'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui'
import { ActiveProgramSelect } from '@/components/program/active-program-select'
import { AnalyticsOverview } from '@/components/progress/analytics-overview'
import { AnalysisPanel } from '@/components/analysis/analysis-panel'
import { RecoveryCharts } from '@/components/overview/recovery-charts'
import { WrappedHighlights } from '@/components/overview/wrapped-highlights'

export const metadata: Metadata = {
  title: 'Home',
}

export const dynamic = 'force-dynamic'

/**
 * Home (route stays /overview — only the label/copy changed) — a single
 * dashboard that pulls everything together: the active-program switcher,
 * wearable steps + sleep (daily/weekly), the deterministic training/goal/
 * body/nutrition analytics, a quick "Wrapped" highlight tile, and the AI
 * overview on top. Recovery is allowlisted (like the AI); the rest is always
 * available.
 */
export default async function OverviewPage() {
  const [profile, programs] = await Promise.all([getProfile(), getPrograms()])
  const unit: Unit = profile?.unit ?? 'lb'
  const activeProgram = programs.find((p) => p.is_active) ?? null

  const { allowed } = await getAnalysisAccess()
  const { analytics, analysis } = await getAnalyticsAndAnalysis()

  let recovery: RecoveryMetric[] = []
  if (allowed) {
    const sb = await createClient()
    const uid = await requireUserId(sb)
    // Keep enough imported history available for the chart's range picker.
    // Today/recovery scoring remains on its separate 35-day query.
    recovery = await getRecoveryRange(sb, uid, 1000)
  }

  return (
    <PageShell>
      <div className="space-y-6">
        {activeProgram ? (
          <ActiveProgramSelect programs={programs} activeId={activeProgram.id} />
        ) : null}

        <WrappedHighlights analytics={analytics} unit={unit} />

        {recovery.length > 0 ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="size-4 text-signal" aria-hidden />
                Recovery
              </CardTitle>
              <CardDescription>
                Steps &amp; sleep from your wearable — recent by default, with longer
                history on demand.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RecoveryCharts rows={recovery} />
            </CardContent>
          </Card>
        ) : null}

        <AnalyticsOverview analytics={analytics} unit={unit} />
        <AnalysisPanel analysis={analysis} allowed={allowed} />
      </div>
    </PageShell>
  )
}

function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-4 sm:pt-6">
      <h1 className="sr-only">Home</h1>
      {children}
    </div>
  )
}
