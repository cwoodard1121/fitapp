import { describe, expect, it } from 'vitest'

import {
  COACH_PROGRAM_TOOLS,
  executeCoachProgramTool,
} from '@/lib/ai/program-tools'

describe('coach program tool contracts', () => {
  it('uses strict schemas with every property explicitly required', () => {
    for (const tool of COACH_PROGRAM_TOOLS) {
      expect(tool.strict).toBe(true)
      expect(tool.parameters.additionalProperties).toBe(false)
      expect([...tool.parameters.required].sort()).toEqual(
        Object.keys(tool.parameters.properties).sort(),
      )
    }
  })

  it('rejects unknown tools without touching program data', async () => {
    await expect(executeCoachProgramTool('drop_everything', '{}')).resolves.toEqual(
      {
        ok: false,
        message: 'Unknown coach tool: drop_everything.',
      },
    )
  })
})
