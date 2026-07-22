import { describe, expect, it } from "vitest"

import { formatRecentDataExport, type RecentExportData } from "./recent-data"

describe("formatRecentDataExport", () => {
  it("combines daily health and workout data into compact AI-readable lines", () => {
    const data: RecentExportData = {
      startDate: "2026-07-09",
      endDate: "2026-07-22",
      unit: "lb",
      days: [
        {
          date: "2026-07-21",
          body: null,
          nutrition: null,
          recovery: null,
          workouts: [],
        },
        {
          date: "2026-07-22",
          body: { bodyweight: 180.25, biaBodyfatPct: 17.5, navyBodyfatPct: null },
          nutrition: { calories: 2200, protein: 180, carbs: 210, fat: 70 },
          recovery: {
            steps: 10543,
            sleepMinutes: 452,
            deepMinutes: 84,
            remMinutes: 101,
            restingHr: 52,
            hrvMs: 47.25,
          },
          workouts: [
            {
              label: "Push",
              exercises: [
                {
                  name: "Bench press",
                  isBodyweight: false,
                  sets: [
                    { load: 185, reps: 8, rir: 2 },
                    { load: 185, reps: 8, rir: 2 },
                    { load: 185, reps: 7, rir: 1 },
                  ],
                  aggregate: null,
                  feel: { pump: 4, enjoyment: 5, soreness: 2, recovery: 4 },
                  performance: "Up",
                  notes: "Strong; moved fast\nno pain",
                },
              ],
            },
          ],
        },
      ],
    }

    expect(formatRecentDataExport(data)).toBe(
      [
        "SimpleGym 14d 2026-07-09..2026-07-22 | BW/load=lb | sets=loadxreps@RIR | feel=pump/enjoyment/soreness/recovery(1-10)",
        "26-07-21 | -",
        "26-07-22 | B BW=180.3 BFbia=17.5% | N kcal=2200 P=180 C=210 F=70 | R steps=10543 sleep=7h32 deep=84 REM=101 RHR=52 HRV=47.3 | W Push: Bench press[185x8@2*2,185x7@1;feel=4/5/2/4;perf=up;note=Strong moved fast no pain]",
      ].join("\n"),
    )
  })

  it("formats aggregate and bodyweight workout logs when individual sets are absent", () => {
    const data: RecentExportData = {
      startDate: "2026-07-09",
      endDate: "2026-07-22",
      unit: "kg",
      days: [
        {
          date: "2026-07-22",
          body: null,
          nutrition: null,
          recovery: null,
          workouts: [
            {
              label: "Pull",
              exercises: [
                {
                  name: "Pull-up",
                  isBodyweight: true,
                  sets: [],
                  aggregate: { load: 10, reps: 8, sets: 3, rir: 2 },
                  feel: { pump: null, enjoyment: null, soreness: null, recovery: null },
                  performance: null,
                  notes: null,
                },
              ],
            },
          ],
        },
      ],
    }

    expect(formatRecentDataExport(data)).toContain("Pull-up[BW+10x8x3@2]")
  })
})
