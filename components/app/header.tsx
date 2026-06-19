"use client"

import Link from "next/link"
import { LogOut, Settings, User } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/** App wordmark — mono with the single signal accent dot. */
function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span className="font-mono text-sm font-semibold tracking-tight text-foreground">
        simplegym
      </span>
      <span
        className="ml-1 inline-block size-1.5 rounded-full bg-signal align-middle"
        aria-hidden
      />
    </span>
  )
}

/**
 * Compact top header — wordmark (shown on mobile; the sidebar carries it on
 * desktop) plus a profile / sign-out menu. Sign-out POSTs to /auth/signout.
 */
export function Header({
  displayName,
  email,
}: {
  displayName: string | null
  email: string | null
}) {
  const name = displayName?.trim() || email || "Athlete"

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6">
      <Link
        href="/today"
        aria-label="simplegym home"
        className="flex items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-background md:hidden"
      >
        <Wordmark />
      </Link>
      {/* Spacer so the menu stays right-aligned on desktop (sidebar holds the wordmark). */}
      <span className="hidden md:block" aria-hidden />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            aria-label="Account menu"
            className="size-9 rounded-full"
          >
            <User className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="text-[11px] uppercase tracking-wide text-muted">
              Signed in as
            </span>
            <span className="truncate text-sm font-medium text-foreground">
              {name}
            </span>
            {email && displayName?.trim() && (
              <span className="truncate font-mono text-xs text-muted">
                {email}
              </span>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings" className="cursor-pointer">
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
              <button type="submit" className="w-full cursor-pointer">
                <LogOut className="size-4" aria-hidden />
                Sign out
              </button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
