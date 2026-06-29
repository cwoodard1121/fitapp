-- ============================================================================
-- simplegym — wearable sync (0005_wearable_sync.sql)
-- ----------------------------------------------------------------------------
-- Import daily STEPS + SLEEP (and optional resting HR / HRV) from a wearable
-- via the Google Health API (the Fitbit Web API successor). Follows the same
-- conventions as 0001_init.sql: idempotent (create-if-not-exists, drop-then-
-- create policy), per-user RLS (user_id = auth.uid()), one daily row keyed
-- unique(user_id, metric_date).
--
-- NOTE on writes: the daily sync runs as a Vercel Cron with NO user session, so
-- it writes with the SERVICE-ROLE key (bypasses RLS). RLS still protects every
-- in-app read. OAuth tokens are stored ENCRYPTED by the app layer (AES-256-GCM)
-- before they ever reach these columns.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 1) wearable_connections  (one row per connected provider per user)
-- ============================================================================
create table if not exists public.wearable_connections (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null,
  provider              text not null default 'google_health'
                          check (provider in ('google_health')),
  -- Stable provider user id (Google Health /users/me/identity).
  google_health_user_id text,
  -- Encrypted at rest (AES-256-GCM) by the app; never store plaintext tokens.
  access_token          text,
  refresh_token         text,
  token_expires_at      timestamptz,
  scopes                text[],
  status                text not null default 'active'
                          check (status in ('active', 'reauth_required')),
  created_at            timestamptz default now(),
  updated_at            timestamptz default now(),
  unique (user_id, provider)
);

-- ============================================================================
-- 2) recovery_metrics  (one row per user per day; NO calorie/energy columns)
-- ============================================================================
create table if not exists public.recovery_metrics (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null,
  metric_date             date not null,
  steps                   int,
  sleep_minutes_asleep    int,
  sleep_minutes_in_period int,
  sleep_light_min         int,
  sleep_deep_min          int,
  sleep_rem_min           int,
  sleep_awake_min         int,
  resting_hr              int,
  hrv_ms                  numeric,
  source                  text not null default 'google_health',
  synced_at               timestamptz default now(),
  unique (user_id, metric_date)
);

-- ============================================================================
-- Row Level Security — enable + per-table owner policy
-- ============================================================================
alter table public.wearable_connections enable row level security;
alter table public.recovery_metrics      enable row level security;

drop policy if exists "wearable_connections_owner" on public.wearable_connections;
create policy "wearable_connections_owner" on public.wearable_connections
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "recovery_metrics_owner" on public.recovery_metrics;
create policy "recovery_metrics_owner" on public.recovery_metrics
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================================
-- Indexes
-- ============================================================================
create index if not exists idx_wearable_connections_user on public.wearable_connections (user_id);
create index if not exists idx_recovery_metrics_user      on public.recovery_metrics (user_id);
create index if not exists idx_recovery_metrics_user_date on public.recovery_metrics (user_id, metric_date);

-- ============================================================================
-- end 0005_wearable_sync.sql
-- ============================================================================
