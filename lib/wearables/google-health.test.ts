import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchNutrition, fetchRecovery } from './google-health'

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function civilDate(value: unknown): string {
  const date = (value as { date: { year: number; month: number; day: number } }).date
  return [
    date.year,
    String(date.month).padStart(2, '0'),
    String(date.day).padStart(2, '0'),
  ].join('-')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Google Health historical reads', () => {
  it('splits a one-year daily rollup into adjacent ranges of at most 90 days', async () => {
    const requests: RequestInit[] = []
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      requests.push(init ?? {})
      return jsonResponse({ rollupDataPoints: [] })
    })
    vi.stubGlobal('fetch', fetchMock)

    await fetchNutrition('access-token', 365, new Date('2026-07-20T16:00:00.000Z'))

    expect(requests).toHaveLength(5)
    const ranges = requests.map((request) => {
      const body = JSON.parse(String(request.body)) as {
        range: { start: unknown; end: unknown }
      }
      return {
        start: civilDate(body.range.start),
        end: civilDate(body.range.end),
      }
    })

    expect(ranges[0].start).toBe('2025-07-21')
    expect(ranges.at(-1)?.end).toBe('2026-07-21')
    for (let index = 0; index < ranges.length; index += 1) {
      const range = ranges[index]
      const spanDays =
        (Date.parse(`${range.end}T00:00:00.000Z`) -
          Date.parse(`${range.start}T00:00:00.000Z`)) /
        86_400_000
      expect(spanDays).toBeLessThanOrEqual(90)
      if (index > 0) expect(range.start).toBe(ranges[index - 1].end)
    }
  })

  it('follows sleep page tokens so history is not capped at 25 sessions', async () => {
    const sleepUrls: string[] = []
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/dataTypes/sleep/dataPoints?')) {
        sleepUrls.push(url)
        const pageToken = new URL(url).searchParams.get('pageToken')
        return pageToken
          ? jsonResponse({
              dataPoints: [
                {
                  sleep: {
                    interval: { endTime: '2026-07-19T12:00:00.000Z' },
                    summary: { minutesAsleep: 390, minutesInSleepPeriod: 430 },
                  },
                },
              ],
            })
          : jsonResponse({
              dataPoints: [
                {
                  sleep: {
                    interval: { endTime: '2026-07-20T12:00:00.000Z' },
                    summary: { minutesAsleep: 420, minutesInSleepPeriod: 460 },
                  },
                },
              ],
              nextPageToken: 'sleep-page-2',
            })
      }
      if (url.includes('dataPoints:dailyRollUp')) {
        return jsonResponse({ rollupDataPoints: [] })
      }
      return jsonResponse({ dataPoints: [] })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchRecovery(
      'access-token',
      2,
      new Date('2026-07-20T16:00:00.000Z'),
    )

    expect(sleepUrls).toHaveLength(2)
    expect(new URL(sleepUrls[1]).searchParams.get('pageToken')).toBe('sleep-page-2')
    expect(result.map((day) => [day.date, day.sleepMinutesAsleep])).toEqual([
      ['2026-07-19', 390],
      ['2026-07-20', 420],
    ])
  })
})
