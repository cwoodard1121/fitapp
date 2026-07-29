import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  gatherAnalytics: vi.fn(),
  getProfile: vi.fn(),
  getActiveProgram: vi.fn(),
  getProgramFull: vi.fn(),
  executeCoachProgramTool: vi.fn(),
}))

vi.mock('@/lib/analytics', () => ({
  gatherAnalytics: mocks.gatherAnalytics,
}))

vi.mock('@/lib/data', () => ({
  getProfile: mocks.getProfile,
  getActiveProgram: mocks.getActiveProgram,
  getProgramFull: mocks.getProgramFull,
}))

vi.mock('@/lib/exercises/catalog', () => ({
  EXERCISE_CATALOG: [],
}))

vi.mock('@/lib/ai/program-tools', () => ({
  COACH_PROGRAM_TOOLS: [
    {
      type: 'function',
      name: 'edit_program_exercise',
      strict: true,
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  ],
  executeCoachProgramTool: mocks.executeCoachProgramTool,
}))

import { getCoachReply } from '@/lib/ai/coach'

function response(body: unknown): Response {
  return {
    ok: true,
    json: async () => body,
  } as Response
}

describe('getCoachReply program tools', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key'
    mocks.gatherAnalytics.mockResolvedValue({ lifts: [] })
    mocks.getProfile.mockResolvedValue(null)
    mocks.getActiveProgram.mockResolvedValue(null)
    mocks.getProgramFull.mockResolvedValue(null)
    mocks.executeCoachProgramTool.mockResolvedValue({
      ok: true,
      message: 'Day 3: replaced Barbell Row with Cable Row.',
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    delete process.env.OPENAI_API_KEY
  })

  it('executes a requested edit and returns the final confirmation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          output: [
            {
              type: 'function_call',
              name: 'edit_program_exercise',
              arguments: '{"day_number":3}',
              call_id: 'call_123',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        response({
          output_text: 'Done — I swapped the row on Day 3.',
          output: [],
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getCoachReply([{ role: 'user', content: 'Swap my Day 3 row.' }]),
    ).resolves.toEqual({
      reply: 'Done — I swapped the row on Day 3.',
      actions: ['Day 3: replaced Barbell Row with Cable Row.'],
    })

    expect(mocks.executeCoachProgramTool).toHaveBeenCalledWith(
      'edit_program_exercise',
      '{"day_number":3}',
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const firstRequest = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string,
    )
    expect(firstRequest.parallel_tool_calls).toBe(false)
    expect(firstRequest.tools[0].strict).toBe(true)

    const secondRequest = JSON.parse(
      (fetchMock.mock.calls[1]?.[1] as RequestInit).body as string,
    )
    expect(secondRequest.input).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'function_call_output',
          call_id: 'call_123',
          output: JSON.stringify({
            ok: true,
            message: 'Day 3: replaced Barbell Row with Cable Row.',
          }),
        }),
      ]),
    )
  })

  it('feeds a failed edit back to the model without reporting a saved action', async () => {
    mocks.executeCoachProgramTool.mockResolvedValue({
      ok: false,
      message: 'That exercise is not on Day 3.',
    })
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({
            output: [
              {
                type: 'function_call',
                name: 'edit_program_exercise',
                arguments: '{}',
                call_id: 'call_failed',
              },
            ],
          }),
        )
        .mockResolvedValueOnce(
          response({
            output_text: 'I could not find that exercise. Which one did you mean?',
            output: [],
          }),
        ),
    )

    await expect(
      getCoachReply([{ role: 'user', content: 'Swap that exercise.' }]),
    ).resolves.toEqual({
      reply: 'I could not find that exercise. Which one did you mean?',
      actions: [],
    })
  })

  it('returns saved actions when the follow-up explanation request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({
            output: [
              {
                type: 'function_call',
                name: 'edit_program_exercise',
                arguments: '{"day_number":3}',
                call_id: 'call_saved',
              },
            ],
          }),
        )
        .mockRejectedValueOnce(new Error('network unavailable')),
    )

    const result = await getCoachReply([
      { role: 'user', content: 'Swap my Day 3 row.' },
    ])

    expect(result.actions).toEqual([
      'Day 3: replaced Barbell Row with Cable Row.',
    ])
    expect(result.reply).toMatch(/saved|up to date/i)
  })

  it('reserves the last response round instead of committing a hidden sixth edit', async () => {
    const fetchMock = vi.fn()
    for (let index = 0; index < 6; index += 1) {
      fetchMock.mockResolvedValueOnce(
        response({
          output: [
            {
              type: 'function_call',
              name: 'edit_program_exercise',
              arguments: `{"day_number":${index + 1}}`,
              call_id: `call_${index + 1}`,
            },
          ],
        }),
      )
    }
    vi.stubGlobal('fetch', fetchMock)

    const result = await getCoachReply([
      { role: 'user', content: 'Make six program edits.' },
    ])

    expect(mocks.executeCoachProgramTool).toHaveBeenCalledTimes(5)
    expect(result.actions).toHaveLength(5)
    expect(result.reply).toMatch(/saved|up to date/i)
  })
})
