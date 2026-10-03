import type { ComponentType, SVGProps } from "react"
import {
  ClipboardList,
  History,
  TrendingUp,
  Boxes,
  Target,
  Apple,
  Settings,
} from "lucide-react"

import {
  BodyPictogram,
  CheckinPictogram,
  HomePictogram,
  LifterPictogram,
  MorePictogram,
} from "./pictograms"

/** Each primary destination is a colour-coded venue. */
export type Venue = "today" | "checkin" | "home" | "body" | "more"

export interface NavItem {
  href: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  venue: Venue
}

const today: NavItem = { href: "/today", label: "today", icon: LifterPictogram, venue: "today" }
const checkin: NavItem = { href: "/checkin", label: "check-in", icon: CheckinPictogram, venue: "checkin" }
const overview: NavItem = { href: "/overview", label: "home", icon: HomePictogram, venue: "home" }
const body: NavItem = { href: "/body", label: "body", icon: BodyPictogram, venue: "body" }
const program: NavItem = { href: "/program", label: "program", icon: ClipboardList, venue: "more" }
const history: NavItem = { href: "/history", label: "history", icon: History, venue: "more" }
const progress: NavItem = { href: "/progress", label: "progress", icon: TrendingUp, venue: "more" }
const blocks: NavItem = { href: "/blocks", label: "blocks", icon: Boxes, venue: "more" }
const goals: NavItem = { href: "/goals", label: "goals", icon: Target, venue: "more" }
const nutrition: NavItem = { href: "/nutrition", label: "nutrition", icon: Apple, venue: "more" }
const settings: NavItem = { href: "/settings", label: "settings", icon: Settings, venue: "more" }

/** Desktop sidebar: every destination, in logical training order. */
export const allNav: NavItem[] = [
  today,
  checkin,
  overview,
  body,
  program,
  history,
  progress,
  blocks,
  goals,
  nutrition,
  settings,
]

/** Mobile tab bar: the four daily venues, plus "more". */
export const primaryNav: NavItem[] = [today, checkin, overview, body]

export const moreNav: NavItem[] = [
  program,
  history,
  progress,
  nutrition,
  blocks,
  goals,
  settings,
]

export const moreItem = { label: "more", icon: MorePictogram, venue: "more" as const }

/** Literal class names so Tailwind keeps them. */
export const VENUE_BG: Record<Venue, string> = {
  today: "bg-hue-today",
  checkin: "bg-hue-checkin",
  home: "bg-hue-home",
  body: "bg-hue-body",
  more: "bg-hue-more",
}

/** True when `pathname` is `href` or a nested route beneath it. */
export function isActiveRoute(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/")
}

/** The venue + title the band shows for a route. */
export function routeVenue(pathname: string | null): { venue: Venue; title: string; item: NavItem | null } {
  const path = pathname ?? "/today"
  const match = allNav.find((item) => isActiveRoute(path, item.href)) ?? null
  if (!match) return { venue: "today", title: "simplegym", item: null }
  return { venue: match.venue, title: match.label, item: match }
}
