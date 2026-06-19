import {
  Dumbbell,
  ClipboardList,
  History,
  TrendingUp,
  CalendarRange,
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
const today: NavItem = { href: "/today", label: "Today", icon: Dumbbell }
const program: NavItem = { href: "/program", label: "Program", icon: ClipboardList }
const history: NavItem = { href: "/history", label: "History", icon: History }
const progress: NavItem = { href: "/progress", label: "Progress", icon: TrendingUp }
const mesocycle: NavItem = { href: "/mesocycle", label: "Mesocycle", icon: CalendarRange }
const body: NavItem = { href: "/body", label: "Body", icon: Scale }
const blocks: NavItem = { href: "/blocks", label: "Blocks", icon: Boxes }
const goals: NavItem = { href: "/goals", label: "Goals", icon: Target }
const nutrition: NavItem = { href: "/nutrition", label: "Nutrition", icon: Apple }
const settings: NavItem = { href: "/settings", label: "Settings", icon: Settings }

/** Desktop sidebar: every destination, in logical training order. */
export const allNav: NavItem[] = [
  today,
  program,
  history,
  progress,
  mesocycle,
  body,
  blocks,
  goals,
  nutrition,
  settings,
]

/** Mobile bottom bar: the four primary destinations (plus a "More" button). */
export const primaryNav: NavItem[] = [today, program, progress, body]

/** Mobile "More" sheet: everything not on the bottom bar. */
export const moreNav: NavItem[] = [history, mesocycle, blocks, goals, nutrition, settings]

/** True when `pathname` is `href` or a nested route beneath it. */
export function isActiveRoute(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/")
}
