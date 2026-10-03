# Product

<!-- impeccable:product-schema 1 -->

> Written 2026-10-02 without an interview: the owner said "don't ask me any questions, full creative liberty". Facts come from the codebase and from the owner's own words across sessions; lines marked *(inferred)* are reasoned, not confirmed.

## Platform

web — installed as a PWA (standalone, portrait) on the owner's phone; also used in a desktop browser.

## Users

One person: the owner, Cameron, a lifter running his own programmed training blocks. He logs sets between lifts on his phone in the gym, does a short morning check-in (soreness, habits, weekly tape measurements), and reviews trends at home. *(inferred)* Sessions happen in a loud, bright gym with one hand free, sweaty thumbs, and 1 to 3 minute rest gaps.

## Product Purpose

simplegym is a personal strength-training autoregulation log. It runs a mesocycle program (the default is the Five-Day Progression), prescribes load and reps per slot from the history and readiness signals, records what was actually lifted, and folds in recovery data (Fitbit steps and sleep), body weight and Navy tape body fat, and nutrition targets during cuts. Success means logging a session is faster than a notes app, and the numbers tell him what to do next.

## Positioning

Unlike a generic workout tracker, it does real autoregulation: per-slot decision gates (progress / hold / back off) from RIR, reps and readiness, a recovery score from wearable data, and nutrition calibration of maintenance calories from logged intake and weight trend. Every screen reads from one personal dataset.

## Operating Context

- **Today:** pick the week and day, then log sets per exercise slot (load, reps, RIR), then finish the session, which shows a "Session Wrapped" recap.
- **Check-in:** daily habits, soreness, weekly Navy tape, recovery strip, and AI analysis focus.
- **Home (/overview):** active program, a weekly wrapped card, recovery charts, analytics including nutrition adherence, and AI analysis.
- **Body:** weight and body-fat logging and trends.
- **Program, History, Progress, Blocks, Goals, Nutrition, Settings:** secondary destinations.
- **AI coach:** a floating chat for the allowlisted account.

## Capabilities and Constraints

- Next.js 15 App Router, React 19, Tailwind 3, Supabase (Postgres + RLS, us-east-1), Vercel Hobby plan (iad1, one cron per day).
- All data is per-user. Mutations go through server actions that call revalidatePath.
- Units can be lb or kg. Day boundaries use the Toronto calendar.
- Must work offline-tolerantly as an installed PWA (service worker, manifest, safe areas, no website-like rubber-band scrolling).

## Brand Commitments

- Name: "simplegym", lowercase.
- The owner's complaints are binding: it must not feel like "a shitty website"; no weird website-style scrolling; bars must never float mid-screen; buttons need generous padding; pages must load fast.

## Evidence on Hand

Real data lives in Supabase. The program "OCTOBER LOCK IN" is active. Do not fabricate lifts, weights, or stats in UI copy.

## Product Principles

1. The gym floor comes first: every logging control works one-handed with a thumb, mid-set.
2. App, not website: a fixed shell, native-feeling navigation, instant feedback on every tap.
3. The numbers lead: prescriptions and trends are the content; chrome stays out of the way.
4. Fast beats clever: no screen should block on data it could show a skeleton for.

## Accessibility & Inclusion

Large tap targets (at least 44px, usually 48px or more), high contrast for use in a bright gym, and respect for reduced motion.
