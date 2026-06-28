"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { moreNav, primaryNav, isActiveRoute } from "./nav-items"

/**
 * Mobile navigation — a sticky bottom tab bar with the four primary
 * destinations plus a "More" button that opens a bottom sheet listing the rest.
 * Hidden at md+ (the sidebar takes over there).
 */
export function MobileNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const moreActive = moreNav.some((item) => isActiveRoute(pathname, item.href))

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-surface/80 md:hidden"
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
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal active:bg-border/40 motion-reduce:transition-none",
                    active ? "text-signal" : "text-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-5 shrink-0" aria-hidden />
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
              className={cn(
                "flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal active:bg-border/40 motion-reduce:transition-none",
                moreActive ? "text-signal" : "text-muted hover:text-foreground",
              )}
            >
              <Menu className="size-5 shrink-0" aria-hidden />
              <span>More</span>
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="mb-3 text-left">
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <ul className="grid grid-cols-3 gap-2">
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
                        "flex h-20 flex-col items-center justify-center gap-2 rounded-md border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-surface motion-reduce:transition-none",
                        active
                          ? "border-signal/40 bg-background text-foreground"
                          : "border-border bg-background text-muted hover:text-foreground",
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-5 shrink-0",
                          active ? "text-signal" : "text-muted",
                        )}
                        aria-hidden
                      />
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
