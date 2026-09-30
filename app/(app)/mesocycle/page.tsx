import { redirect } from 'next/navigation'

/**
 * Mesocycle merged into Program as its "Schedule" tab — this route now just
 * forwards old links/bookmarks so nothing 404s.
 */
export default function MesocyclePage() {
  redirect('/program?tab=schedule')
}
