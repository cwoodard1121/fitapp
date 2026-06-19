# simplegym

A personal strength-training **autoregulation** web app. Mobile-first, with a
dark "instrument panel" aesthetic: dense tabular rows, monospaced figures that
align like readouts, and a single electric-chartreuse signal color reserved for
progress, CTAs, and the engine's decisions.

You log a working set (load, best reps, RIR) plus a few quick recovery signals.
A pure, side-effect-free **engine** turns that into one clear call per
exercise — *add load, add a rep, add a set, maintain, or hold/reduce* — with a
one-line reason and an e1RM sparkline. Built for a single user first, but
structured (RLS, per-user rows) to scale to many.

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript 5** (strict)
- **Tailwind CSS v3.4** + `tailwindcss-animate`, shadcn/ui-style components
- **Supabase** (`@supabase/supabase-js` + `@supabase/ssr`) — cookie-based SSR
  auth via email magic link, Postgres + Row Level Security
- **recharts** for charts, **geist** fonts, **lucide-react** icons
- **zod** validation, **sonner** toasts, **date-fns**
- **vitest** for the engine unit tests

## Quickstart

```bash
npm install                      # the integrator runs this once
cp .env.example .env.local       # then fill in your Supabase URL + anon key
npm run db:push                  # apply the migration (see DEPLOY.md to link first)
npm run dev                      # http://localhost:3000  (redirects to /today)
```

Then open the app and sign in with a magic link.

### Scripts

| Script            | What it does                          |
| ----------------- | ------------------------------------- |
| `npm run dev`     | Start the dev server                  |
| `npm run build`   | Production build                      |
| `npm run start`   | Serve the production build            |
| `npm run lint`    | Lint with `next lint`                 |
| `npm run test`    | Run the engine unit tests (`vitest`)  |
| `npm run db:push` | Push migrations to Supabase           |

## Environment

Set these in `.env.local` (see `.env.example`):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (optional, server-only)

## Deploy

Full Vercel + Supabase setup, migration, and env-var instructions live in
[`DEPLOY.md`](./DEPLOY.md).

## Project layout

```
app/            App Router routes, layout, global styles, web manifest
components/ui/  Hand-written shadcn-style primitives, styled to the tokens
lib/engine/     The pure autoregulation engine (+ vitest tests)
lib/data/       Typed Supabase reads/writes shared by feature screens
lib/supabase/   SSR + browser Supabase clients and middleware
lib/seed/       The default seed program
supabase/       SQL migration + local config
```
