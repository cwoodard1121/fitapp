# Wearable sync setup — Fitbit steps & sleep via the Google Health API

This connects your **Fitbit** so the app imports your daily **steps** and **sleep**
(and, optionally, resting HR / HRV). Calories are never imported by design.

> **Why the Google Health API and not the Fitbit Web API?** The legacy Fitbit Web
> API is being decommissioned (~Sept 2026) in favor of the Google Health API. We
> build on the successor so it doesn't break in a few months.

You only do this **once**. It's ~20 minutes.

---

## 0. Prerequisite — link Fitbit to a Google Account

In the Fitbit / Google Health mobile app, migrate your Fitbit login to a **Google
Account** and confirm steps/sleep are showing. The API only returns data for a
Fitbit that's actually linked to the Google account you'll sign in with.

## 1. Create a Google Cloud project

1. Go to <https://console.cloud.google.com> → create a project (e.g.
   `simplegym-wearables`) and select it.
2. **APIs & Services → Library** → search **"Google Health API"** → **Enable**.
   (If it's not visible, enable billing on the project first — enabling the API
   doesn't cost anything at this volume.)

## 2. OAuth consent screen

3. **APIs & Services → OAuth consent screen** → User type **External** → fill App
   name (`simplegym`), support email, developer contact → Save.
4. **Audience / Test users** → add **your own Google account** as a Test user.
   (This is what lets you grant the restricted scopes on an unverified app.)
5. **Data Access → Add or remove scopes** → search "Google Health API" → add:
   - `.../auth/googlehealth.activity_and_fitness.readonly` — **steps**
   - `.../auth/googlehealth.sleep.readonly` — **sleep**
   - `.../auth/googlehealth.health_metrics_and_measurements.readonly` — *(optional: resting HR + HRV)*

   They'll show as **Restricted** — that's expected.

## 3. Avoid the 7-day token death (important)

6. **OAuth consent screen → Publishing status → "Publish app" / In Production.**
   **Leave it UNVERIFIED** — do **not** start the verification submission.

   - In **Testing** status, refresh tokens **expire after 7 days**, which would
     break the daily cron (you'd have to reconnect weekly).
   - In **In Production** status (still unverified), refresh tokens are
     long-lived. The app stays capped at 100 users and shows a "Google hasn't
     verified this app" screen — both fine for personal use.
   - If the console refuses In Production with restricted scopes while
     unverified, stay in Testing — the app handles the weekly expiry by flagging
     "Reconnect" in Settings; you'd just re-click Connect each week.

## 4. Create OAuth credentials

7. **APIs & Services → Credentials → Create credentials → OAuth client ID →
   Web application.** Under **Authorized redirect URIs** add both:
   - `http://localhost:3000/api/wearables/google/callback` (local dev)
   - `https://<your-vercel-domain>/api/wearables/google/callback`

   Copy the **Client ID** and **Client secret**.

## 5. Environment variables

Set these locally (`.env.local`) and in **Vercel → Project Settings → Environment
Variables** (Production):

**Required** (the manual "Sync now" flow needs only these):

```
GOOGLE_HEALTH_CLIENT_ID=...
GOOGLE_HEALTH_CLIENT_SECRET=...
GOOGLE_HEALTH_REDIRECT_URI=https://<your-vercel-domain>/api/wearables/google/callback

# 32-byte base64 — encrypts the stored OAuth tokens at rest:
WEARABLE_TOKEN_ENC_KEY=<node -e "console.log(require('crypto').randomBytes(32).toString('base64'))">
```

**Optional** — only if you later wire up the background sync route
(`/api/cron/wearable-sync`) to an external scheduler. The in-app "Sync now"
button does **not** need these:

```
# Protects the sync route (the scheduler sends it as Authorization: Bearer):
CRON_SECRET=<node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
# Lets that route write without a user session (it bypasses RLS):
SUPABASE_SERVICE_ROLE_KEY=<from Supabase → Settings → API>
```

> Keep `WEARABLE_TOKEN_ENC_KEY` stable — rotating it makes existing stored tokens
> undecryptable (you'd just reconnect).

## 6. Apply the database migration

Run `supabase/migrations/0005_wearable_sync.sql` (via `npm run db:push`, or paste
it into the Supabase SQL editor). It creates `wearable_connections` and
`recovery_metrics` with the usual per-user RLS.

## 7. Connect

8. Redeploy so Vercel picks up the env vars, then open **Settings → Wearable
   sync → "Connect Fitbit (Google Health)"**.
9. On the Google screen, click through the "Google hasn't verified this app"
   warning and grant the scopes. The callback stores your (encrypted) tokens and
   runs a first sync.

Syncing is **manual**: hit **"Sync now"** in Settings whenever you want fresh
data (it refreshes the token and re-pulls the last 3 days). That's the intended
flow — sync after your watch has synced.

> *Optional automation:* if you ever want it hands-off, set `CRON_SECRET` +
> `SUPABASE_SERVICE_ROLE_KEY` and point an external scheduler (e.g. cron-job.org)
> at `GET /api/cron/wearable-sync` with header `Authorization: Bearer $CRON_SECRET`
> as often as you like. There's no built-in schedule.

---

## How it works (for reference)

- **OAuth** — standard Google authorization-code flow.
  `app/api/wearables/google/{connect,callback}/route.ts`.
- **Tokens** — encrypted (AES-256-GCM) in `wearable_connections`. `lib/wearables/`.
- **Sync** — `lib/wearables/sync.ts` refreshes the token, pulls steps
  (`steps/dataPoints:dailyRollUp`) + sleep (`sleep/dataPoints`), strips any
  energy fields, and upserts `recovery_metrics`. Used by both the "Sync now"
  button (your session) and the optional `/api/cron/wearable-sync` route.
- **Optional sync route** — `/api/cron/wearable-sync`, protected by `CRON_SECRET`
  (sent as `Authorization: Bearer`); not scheduled by default.

### Known unknowns to confirm on first real sync

A few Google Health response details weren't fully pinned down in the docs; the
code parses defensively, but if a field comes back empty, check:

- the steps daily-rollup aggregate field name (we try `count_sum` then fall back),
- the daily HRV/RHR data-type ids (`daily-heart-rate-variability` /
  `daily-resting-heart-rate`) — HRV/RHR are best-effort and won't block steps/sleep.

If steps or sleep are empty after connecting, hit **Sync now** and check the
function logs for the raw Google Health response shape, then tell me and I'll
adjust the field mapping.
