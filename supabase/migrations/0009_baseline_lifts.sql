-- ============================================================================
-- 0009 - baseline lifts for body-fat estimate calibration
-- ----------------------------------------------------------------------------
-- Manual lift anchors let users feed the body-fat estimator when a main lift
-- has not been logged recently. These rows are not workout logs; they are
-- estimator evidence scoped to the owning user.
-- ============================================================================

create table if not exists public.baseline_lifts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  lift_kind     text not null check (lift_kind in ('bench', 'squat', 'deadlift', 'press')),
  exercise_name text not null,
  e1rm          numeric not null check (e1rm > 0),
  lifted_on     date,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (user_id, lift_kind)
);

alter table public.baseline_lifts enable row level security;

drop policy if exists "baseline_lifts_owner" on public.baseline_lifts;
create policy "baseline_lifts_owner" on public.baseline_lifts
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists idx_baseline_lifts_user
  on public.baseline_lifts (user_id);

-- ============================================================================
-- end 0009_baseline_lifts.sql
-- ============================================================================
