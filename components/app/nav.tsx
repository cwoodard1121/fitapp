"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import { VENUE_BG, allNav, isActiveRoute } from "./nav-items"

/**
 * Desktop sidebar navigation: every destination; the active one becomes its
 * venue's colour field, the rest carry a small hue chip.
 */
export function Nav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 px-3 py-4">
      {allNav.map((item, index) => {
        const active = isActiveRoute(pathname, item.href)
        const Icon = item.icon
        const primary = item.venue !== "more"
        return (
          <div key={item.href}>
            {index === 4 ? <div className="mx-3 my-3 h-px bg-border" aria-hidden /> : null}
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-11 select-none items-center gap-3 rounded-md px-3 text-[0.9375rem] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-surface motion-reduce:transition-none",
                active
                  ? cn(VENUE_BG[item.venue], "text-on-hue")
                  : "text-muted hover:bg-surface-2 hover:text-foreground",
              )}
            >
              <Icon
                className="size-5 shrink-0"
                {...(primary ? {} : { strokeWidth: 2.25 })}
                aria-hidden
              />
              <span>{item.label}</span>
              {primary && !active ? (
                <span
                  aria-hidden
                  className={cn("ml-auto size-2 rounded-[2px]", VENUE_BG[item.venue])}
                />
              ) : null}
            </Link>
          </div>
        )
      })}
    </nav>
  )
}
