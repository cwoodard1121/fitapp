# Deploy simplegym

This guide takes you from an empty Supabase project + GitHub repo to a live app
on Vercel. Three parts: **(A) Supabase**, **(B) Vercel**, **(C) First run**.

You only need the values from part A to do part B, so do them in order.

---

## A. Supabase (database + auth)

### 1. Create the project

1. Go to <https://supabase.com/dashboard> and click **New project**.
2. Pick an org, name it `simplegym`, set a strong database password, choose a
   region near you, and create it. Wait for provisioning to finish.
3. Open **Project Settings → API** and copy these — you'll need them for Vercel:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` *(optional, server-only)*
4. From the URL `https://<ref>.supabase.co`, the `<ref>` part is your
   **project ref** (also shown under **Project Settings → General**).

### 2. Apply the schema

The full schema, RLS, owner policies, the `handle_new_user` trigger, and all
indexes live in `supabase/migrations/0001_init.sql`. It is **idempotent and
re-runnable** — applying it more than once is safe. Pick ONE option:

#### Option 1 — Supabase CLI (recommended, auto-applies migrations)

Run these from the repo root. Install the CLI first if needed
(<https://supabase.com/docs/guides/cli>):

```bash
supabase login
supabase link --project-ref <ref>
supabase db push
```

- `supabase link` connects this repo (which already contains
  `supabase/config.toml` with `project_id = "simplegym"`) to your remote project.
- `supabase db push` applies every file in `supabase/migrations/` — i.e. it runs
  `0001_init.sql` against the remote database.

#### Option 2 — SQL editor (manual fallback, no CLI)

1. In the dashboard open **SQL Editor → New query**.
2. Copy the entire contents of `supabase/migrations/0001_init.sql`, paste it in,
   and click **Run**.

Either way you're done — **RLS and per-table policies are already included in the
migration**, so no extra security setup is required.

> Note: `supabase/seed.sql` is intentionally empty. Seeding is app-side (see
> part C); there is nothing to load manually.

### 3. Enable email auth (magic link)

1. Open **Authentication → Providers → Email** and make sure it's enabled.
2. Magic links are the sign-in method this app uses
   (`supabase.auth.signInWithOtp`). Confirming email addresses is optional —
   for a single-user setup you can leave "Confirm email" off.
3. You'll set the redirect URL in part B once you know the Vercel domain.
   (For local development, `http://localhost:3000/auth/callback` is already
   listed in `supabase/config.toml`.)

---

## B. Vercel (hosting)

### 1. Import the repo

1. Push this repo to GitHub (or GitLab/Bitbucket).
2. Go to <https://vercel.com/new>, import the repo. Vercel auto-detects Next.js;
   keep the default build command (`next build`) and output settings.

### 2. Set environment variables

In **Project → Settings → Environment Variables**, add (for Production, and
Preview if you want preview deploys to work):

| Name | Value | Required |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL from A.3 | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key from A.3 | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key from A.3 | Optional (server-only) |

> Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only — never prefix it with
> `NEXT_PUBLIC_`. It bypasses RLS.

### 3. Point Supabase auth at the Vercel domain

After the first deploy you'll have a domain like
`https://simplegym.vercel.app`. Back in the Supabase dashboard under
**Authentication → URL Configuration**:

- Set **Site URL** to your Vercel domain, e.g. `https://simplegym.vercel.app`.
- Add a **Redirect URL**:
  `https://simplegym.vercel.app/auth/callback`
  (this is where the magic-link callback route exchanges the code for a session).
- If you use a custom domain, add its `/auth/callback` URL too.

### 4. Deploy

Click **Deploy** (or push to your default branch). Vercel builds and serves the
app. Re-deploys happen automatically on every push.

---

## C. First run

1. Open your Vercel URL and go to the login page.
2. Enter your email and request a magic link, then click the link in your inbox.
   The `/auth/callback` route exchanges the code for a session and lands you in
   the app.
3. On first sign-in the app **auto-seeds your default program** ("Mesocycle 1":
   5 days + their exercise slots). Your `profiles` row was already created by the
   `handle_new_user` trigger the moment your auth user was created.
4. That's it — start logging sets.

---

## Reference: environment variables

```bash
# Required (client + server)
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-public-key>

# Optional (server-only; bypasses RLS — never expose to the browser)
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```
