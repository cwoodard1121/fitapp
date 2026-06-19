import {
  getActiveProgram,
  getProfile,
  getProgramFull,
  seedDefaultProgram,
} from '@/lib/data'
import { ProgramEditor } from '@/components/program/program-editor'

export const metadata = {
  title: 'Program',
}

/**
 * Program editor route. Loads the active program (seeding the default one on
 * first visit so the editor is never empty) and hands the full tree to a
 * client editor. All mutations flow through ./actions.ts.
 */
export default async function ProgramPage() {
  const profile = await getProfile()
  const unit = profile?.unit ?? 'lb'

  let program = await getActiveProgram()
  if (!program) {
    program = await seedDefaultProgram()
  }

  const full = await getProgramFull(program.id)

  if (!full) {
    return (
      <div className="mx-auto w-full max-w-3xl py-8">
        <h1 className="text-xl font-semibold tracking-tight">Program</h1>
        <p className="mt-2 text-sm text-muted">
          We couldn’t load your program. Reload the page to try again.
        </p>
      </div>
    )
  }

  return <ProgramEditor initial={full} unit={unit} />
}
