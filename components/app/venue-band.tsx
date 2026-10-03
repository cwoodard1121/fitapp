"use client"

import { useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LogOut, Settings, UserRound } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { VENUE_BG, routeVenue } from "./nav-items"

/**
 * The venue band: a full-bleed field in the current destination's hue that
 * runs under the status bar, naming where you are in lowercase signage.
 */
export function VenueBand({
  displayName,
  email,
}: {
  displayName: string | null
  email: string | null
}) {
  const pathname = usePathname()
  const { venue, title, item } = routeVenue(pathname)
  const Icon = item?.icon
  const name = displayName?.trim() || email || "athlete"

  // Android tints its status bar from theme-color; match the band.
  useEffect(() => {
    const channels = getComputedStyle(document.documentElement)
      .getPropertyValue(`--hue-${venue}-rgb`)
      .trim()
    if (!channels) return
    const [r, g, b] = channels.split(/\s+/).map(Number)
    const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`
    document
      .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
      .forEach((meta) => meta.setAttribute("content", hex))
  }, [venue])

  return (
    <header
      className={cn(
        "relative z-30 flex h-header shrink-0 items-end text-on-hue transition-colors duration-200 [view-transition-name:venue-band] motion-reduce:transition-none",
        VENUE_BG[venue],
      )}
    >
      {/* Same max-w-3xl column as the pages below, so title and content share a left edge. */}
      <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon ? <Icon className="size-[1.6rem] shrink-0" /> : null}
          <span className="truncate text-[1.375rem] font-extrabold leading-none tracking-[-0.02em] font-wide">
            {title}
          </span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Account menu"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-on-hue/10 text-on-hue transition-colors hover:bg-on-hue/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-hue active:scale-95"
            >
              <UserRound className="size-5" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
              <span className="text-xs font-medium text-muted">signed in as</span>
              <span className="truncate text-sm font-semibold text-foreground">
                {name}
              </span>
              {email && displayName?.trim() ? (
                <span className="truncate text-xs text-muted">{email}</span>
              ) : null}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings" className="min-h-11 cursor-pointer">
                <Settings className="size-4" aria-hidden />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <form action="/auth/signout" method="post">
              <DropdownMenuItem
                asChild
                className="text-gate-red focus:text-gate-red"
              >
                <button type="submit" className="min-h-11 w-full cursor-pointer">
                  <LogOut className="size-4" aria-hidden />
                  Sign out
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
