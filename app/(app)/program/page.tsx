import {
  getActiveProgram,
  getPrograms,
  getProfile,
  getProgramFull,
  seedDefaultProgram,
} from '@/lib/data'
import { ProgramEditor } from '@/components/program/program-editor'

export const metadata = {
  title: 'Program',
}

/**
 * Program editor route. Loads every program the user owns plus the full tree of
 * the one being edited (chosen by ?p=<id>, defaulting to the active program).
 * Editing a program is independent of which one is active for training — the
 * switcher in the editor handles "set active". All mutations flow through
 * ./actions.ts.
 */
export default async function ProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>
}) {
  const { p: pParam } = await searchParams
  const profile = await getProfile()
  const unit = profile?.unit ?? 'lb'

  let programs = await getPrograms()
  if (programs.length === 0) {
    // First visit — seed the default program so the editor is never empty.
    await seedDefaultProgram()
    programs = await getPrograms()
  }

  const active = programs.find((p) => p.is_active) ?? null
  // Pick the program to edit: explicit ?p= (if owned), else active, else first.
  const selected =
    (pParam && programs.find((p) => p.id === pParam)) ||
    active ||
    programs[0]

  const full = selected ? await getProgramFull(selected.id) : null

  if (!full) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <h1 className="text-xl font-semibold tracking-tight">Program</h1>
        <p className="mt-2 text-sm text-muted">
          We couldn’t load your program. Reload the page to try again.
        </p>
      </div>
    )
  }

  return (
    <ProgramEditor
      key={full.program.id}
      initial={full}
      unit={unit}
      programs={programs}
      activeId={active?.id ?? null}
    />
  )
}
