import type { ReactNode } from "react"
import Link from "next/link"

import { ensureProfile, seedDefaultProgram, getCachedUser } from "@/lib/data"
import { isEmailAllowed } from "@/lib/ai/allowlist"
import { createClient } from "@/lib/supabase/server"
import { Header } from "@/components/app/header"
import { Nav } from "@/components/app/nav"
import { MobileNav } from "@/components/app/mobile-nav"
import { CoachWidget } from "@/components/coach/coach-widget"
import { WearableAutoSync } from "@/components/wearables/wearable-auto-sync"

/**
 * Authenticated app shell. As a Server Component it first makes sure the user
 * is fully set up — ensureProfile() and seedDefaultProgram(), both idempotent
 * and independent (neither reads the other's table, no FK between them) — so
 * a brand-new user lands on a working default program immediately. Then it
 * renders the responsive instrument-panel shell: a fixed left sidebar on
 * desktop, a sticky bottom tab bar on mobile, a compact top header, and the
 * page content.
 */
export default async function AppLayout({
  children,
}: {
  children: ReactNode
}) {
  const supabase = await createClient()
  // Idempotent first-run setup, run concurrently — independent tables, and
  // both internally reuse the same cached auth check as the `getCachedUser`
  // call right below instead of each re-validating the session over the
  // network (see lib/data/auth.ts).
  const [profile] = await Promise.all([ensureProfile(), seedDefaultProgram()])

  const user = await getCachedUser(supabase)

  return (
    // Pinned to the viewport (not a normal scrolling document) so the shell
    // — sidebar, header, tab bar — never moves or rubber-bands. `<main>`
    // below is the one region that actually scrolls; this is what makes the
    // installed PWA feel like an app shell instead of a scrolling website.
    <div className="fixed inset-0 overflow-hidden overscroll-none bg-background text-foreground">
      {/* Desktop sidebar (md+) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col overflow-y-auto overscroll-contain border-r border-border bg-background md:flex">
        <Link
          href="/today"
          aria-label="simplegym home"
          className="flex h-14 shrink-0 items-center gap-1.5 border-b border-border px-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal"
        >
          <span className="font-mono text-sm font-semibold tracking-tight text-foreground">
            simplegym
          </span>
          <span
            className="size-1.5 rounded-full bg-signal"
            aria-hidden
          />
        </Link>
        <Nav />
        <div className="border-t border-border px-5 py-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
            Instrument panel
          </p>
        </div>
      </aside>

      {/* Content column */}
      <div className="flex h-full flex-col md:pl-60">
        <Header
          displayName={profile.display_name}
          email={user?.email ?? null}
        />
        {/* The one scrollable region. Pages own their own horizontal padding
            + max-width; the shell only guarantees vertical rhythm and mobile
            bottom-nav clearance. The bottom pad tracks the tab bar height
            *and* the home indicator so nothing tucks under the blurred bar
            on phones. overscroll-contain keeps a scroll-to-edge here from
            bouncing the whole shell. */}
        <main className="flex-1 overflow-y-auto overscroll-contain pb-nav-room pt-4 md:pb-2 md:pt-6">
          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar + More sheet (hidden at md+) */}
      <MobileNav />

      {/* Floating AI coach — grounded in the user's analytics, allowlisted only.
          The /api/coach route enforces the same gate defensively. */}
      {isEmailAllowed(user?.email) ? <CoachWidget /> : null}

      {/* Silent Fitbit sync on every fresh app open (see component doc). */}
      <WearableAutoSync />
    </div>
  )
}
