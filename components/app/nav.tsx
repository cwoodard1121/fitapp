"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import { allNav, isActiveRoute } from "./nav-items"

/**
 * Desktop sidebar navigation — lists every destination with a lucide icon and
 * label. The active route is highlighted (signal accent + aria-current).
 */
export function Nav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Primary" className="flex flex-1 flex-col gap-0.5 px-3 py-4">
      {allNav.map((item) => {
        const active = isActiveRoute(pathname, item.href)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none",
              active
                ? "bg-surface text-foreground"
                : "text-muted hover:bg-surface hover:text-foreground",
            )}
          >
            <Icon
              className={cn(
                "size-[18px] shrink-0",
                active ? "text-signal" : "text-muted group-hover:text-foreground",
              )}
              aria-hidden
            />
            <span>{item.label}</span>
            {active && (
              <span
                className="ml-auto size-1.5 rounded-full bg-signal"
                aria-hidden
              />
            )}
          </Link>
        )
      })}
    </nav>
  )
}
