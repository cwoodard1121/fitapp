import type { ReactNode } from "react"
import Link from "next/link"

import { ensureProfile, seedDefaultProgram } from "@/lib/data"
import { createClient } from "@/lib/supabase/server"
import { Header } from "@/components/app/header"
import { Nav } from "@/components/app/nav"
import { MobileNav } from "@/components/app/mobile-nav"

/**
 * Authenticated app shell. As a Server Component it first makes sure the user
 * is fully set up — ensureProfile() then seedDefaultProgram(), both idempotent —
 * so a brand-new user lands on a working default program immediately. Then it
 * renders the responsive instrument-panel shell: a fixed left sidebar on
 * desktop, a sticky bottom tab bar on mobile, a compact top header, and the
 * page content.
 */
export default async function AppLayout({
  children,
}: {
  children: ReactNode
}) {
  // Idempotent first-run setup. Order matters: profile, then default program.
  const profile = await ensureProfile()
  await seedDefaultProgram()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="min-h-svh bg-background text-foreground">
      {/* Desktop sidebar (md+) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-background md:flex">
        <Link
          href="/today"
          aria-label="simplegym home"
          className="flex h-14 items-center gap-1.5 border-b border-border px-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal"
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
      <div className="flex min-h-svh flex-col md:pl-60">
        <Header
          displayName={profile.display_name}
          email={user?.email ?? null}
        />
        <main className="flex-1 px-4 pb-20 pt-4 md:px-6 md:pb-0 md:pt-6">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>

      {/* Mobile bottom tab bar + More sheet (hidden at md+) */}
      <MobileNav />
    </div>
  )
}
