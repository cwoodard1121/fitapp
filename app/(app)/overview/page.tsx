import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Activity } from 'lucide-react'

import { getProfile, requireUserId } from '@/lib/data'
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
import { AnalyticsOverview } from '@/components/progress/analytics-overview'
import { AnalysisPanel } from '@/components/analysis/analysis-panel'
import { RecoveryCharts } from '@/components/overview/recovery-charts'

export const metadata: Metadata = {
  title: 'Overview',
}

export const dynamic = 'force-dynamic'

/**
 * Overview — a single dashboard that pulls everything together: wearable steps +
 * sleep (daily/weekly), the deterministic training/goal/body/nutrition analytics,
 * and the AI overview on top. Recovery is allowlisted (like the AI); the rest is
 * always available.
 */
export default async function OverviewPage() {
  const profile = await getProfile()
  const unit: Unit = profile?.unit ?? 'lb'

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
    <div className="mx-auto w-full max-w-3xl px-4 py-6 pb-24 sm:py-8">
      <header className="mb-5 space-y-1">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
          simplegym
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted">
          Your training, body, nutrition, and recovery — at a glance.
        </p>
      </header>
      {children}
    </div>
  )
}
