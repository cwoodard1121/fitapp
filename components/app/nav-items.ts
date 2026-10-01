import {
  Dumbbell,
  LayoutDashboard,
  ClipboardList,
  ClipboardCheck,
  History,
  TrendingUp,
  Scale,
  Boxes,
  Target,
  Apple,
  Settings,
  type LucideIcon,
} from "lucide-react"

/** A single navigation destination. */
export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

// Define each destination once so the mobile + desktop navs stay in sync.
// Mesocycle used to be its own destination; it's now the "Schedule" tab on
// Program (both are "what's my training plan doing right now") — one fewer
// nav item, not a relabel.
const today: NavItem = { href: "/today", label: "Today", icon: Dumbbell }
const checkin: NavItem = { href: "/checkin", label: "Check-in", icon: ClipboardCheck }
const overview: NavItem = { href: "/overview", label: "Overview", icon: LayoutDashboard }
const program: NavItem = { href: "/program", label: "Program", icon: ClipboardList }
const history: NavItem = { href: "/history", label: "History", icon: History }
const progress: NavItem = { href: "/progress", label: "Progress", icon: TrendingUp }
const body: NavItem = { href: "/body", label: "Body", icon: Scale }
const blocks: NavItem = { href: "/blocks", label: "Blocks", icon: Boxes }
const goals: NavItem = { href: "/goals", label: "Goals", icon: Target }
const nutrition: NavItem = { href: "/nutrition", label: "Nutrition", icon: Apple }
const settings: NavItem = { href: "/settings", label: "Settings", icon: Settings }

/** Desktop sidebar: every destination, in logical training order. */
export const allNav: NavItem[] = [
  today,
  checkin,
  overview,
  program,
  history,
  progress,
  body,
  blocks,
  goals,
  nutrition,
  settings,
]

/** Mobile bottom bar: the four primary destinations (plus a "More" button).
 * Check-in replaces Progress here — it's a daily action, Progress is more
 * occasional/retrospective, and the bar stays at four so it doesn't get more
 * crowded. */
export const primaryNav: NavItem[] = [today, checkin, overview, body]

/** Mobile "More" sheet: everything not on the bottom bar. */
export const moreNav: NavItem[] = [
  program,
  history,
  progress,
  blocks,
  goals,
  nutrition,
  settings,
]

/** True when `pathname` is `href` or a nested route beneath it. */
export function isActiveRoute(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/")
}
