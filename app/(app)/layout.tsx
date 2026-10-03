import type { ReactNode } from "react"
import Link from "next/link"

import { ensureProfile, seedDefaultProgram, getCachedUser } from "@/lib/data"
import { isEmailAllowed } from "@/lib/ai/allowlist"
import { createClient } from "@/lib/supabase/server"
import { VenueBand } from "@/components/app/venue-band"
import { Nav } from "@/components/app/nav"
import { MobileNav } from "@/components/app/mobile-nav"
import { PullToRefresh } from "@/components/app/pull-to-refresh"
import { KeyboardWatch } from "@/components/app/keyboard-watch"
import { CoachWidget } from "@/components/coach/coach-widget"
import { WearableAutoSync } from "@/components/wearables/wearable-auto-sync"

/**
 * Authenticated app shell. Runs the idempotent first-run setup, then renders
 * a fixed app frame: sidebar (md+), venue band, one scroll region with
 * pull-to-refresh, and the mobile tab bar. Nothing but `<main>` scrolls, so
 * the installed PWA never rubber-bands its chrome like a web page.
 */
export default async function AppLayout({
  children,
}: {
  children: ReactNode
}) {
  const supabase = await createClient()
  const [profile] = await Promise.all([ensureProfile(), seedDefaultProgram()])
  const user = await getCachedUser(supabase)

  return (
    <div className="fixed inset-0 overflow-hidden overscroll-none bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col overflow-y-auto overscroll-contain border-r border-border bg-surface md:flex">
        <Link
          href="/today"
          aria-label="simplegym, today"
          className="flex h-header shrink-0 items-end px-6 pb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal"
        >
          <span className="text-xl font-extrabold tracking-[-0.03em] text-foreground font-wide">
            simplegym
          </span>
        </Link>
        <Nav />
      </aside>

      <div className="flex h-full flex-col md:pl-60">
        <VenueBand
          displayName={profile.display_name}
          email={user?.email ?? null}
        />
        <PullToRefresh className="flex-1 overflow-y-auto overscroll-contain pb-nav-room pt-1 md:pb-8 md:pt-4 md:[scrollbar-gutter:stable_both-edges]">
          {children}
        </PullToRefresh>
      </div>

      <MobileNav />
      <KeyboardWatch />

      {isEmailAllowed(user?.email) ? <CoachWidget /> : null}

      <WearableAutoSync />
    </div>
  )
}
