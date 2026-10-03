"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  VENUE_BG,
  isActiveRoute,
  moreItem,
  moreNav,
  primaryNav,
  type Venue,
} from "./nav-items"

/** Hue bar riding the top edge of the active tab; it glides between tabs. */
function ActiveMarker({ venue }: { venue: Venue }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute inset-x-3 top-0 h-[3px] rounded-b-full [view-transition-name:tab-marker]",
        VENUE_BG[venue],
      )}
    />
  )
}

const cellClass =
  "relative flex h-[4.25rem] w-full select-none flex-col items-center justify-center gap-1 text-xs font-semibold transition-[color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal active:scale-[0.94] motion-reduce:transition-none motion-reduce:active:scale-100"

/**
 * Mobile tab bar: the four daily venues and "more", each a pictogram with a
 * lowercase label. Hidden at md+ where the sidebar takes over.
 */
export function MobileNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const moreActive = moreNav.some((item) => isActiveRoute(pathname, item.href))
  const MoreIcon = moreItem.icon

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-safe-b md:hidden"
      >
        <ul className="grid grid-cols-5">
          {primaryNav.map((item) => {
            const active = isActiveRoute(pathname, item.href)
            const Icon = item.icon
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(cellClass, active ? "text-foreground" : "text-muted")}
                >
                  {active ? <ActiveMarker venue={item.venue} /> : null}
                  <Icon className="size-[1.625rem] shrink-0" />
                  <span>{item.label}</span>
                </Link>
              </li>
            )
          })}

          <li>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-current={moreActive ? "page" : undefined}
              className={cn(cellClass, moreActive ? "text-foreground" : "text-muted")}
            >
              {moreActive ? <ActiveMarker venue="more" /> : null}
              <MoreIcon className="size-[1.625rem] shrink-0" />
              <span>{moreItem.label}</span>
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="px-4">
          <SheetHeader className="mb-4 text-left">
            <SheetTitle className="font-wide text-2xl font-extrabold">more</SheetTitle>
          </SheetHeader>
          <ul className="grid grid-cols-3 gap-2.5">
            {moreNav.map((item) => {
              const active = isActiveRoute(pathname, item.href)
              const Icon = item.icon
              return (
                <li key={item.href}>
                  <SheetClose asChild>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-24 select-none flex-col items-center justify-center gap-2.5 rounded-lg text-sm font-semibold transition-[background-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal active:scale-[0.96] motion-reduce:transition-none",
                        active
                          ? "bg-hue-more text-on-hue"
                          : "bg-surface-2 text-foreground hover:bg-border/70",
                      )}
                    >
                      <Icon className="size-6 shrink-0" strokeWidth={2.25} aria-hidden />
                      <span>{item.label}</span>
                    </Link>
                  </SheetClose>
                </li>
              )
            })}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  )
}
