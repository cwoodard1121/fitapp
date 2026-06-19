-- ============================================================================
-- simplegym — initial schema (0001_init.sql)
-- ----------------------------------------------------------------------------
-- Idempotent + re-runnable: create table if not exists, drop policy if exists
-- then create, create index if not exists, create or replace function, and
-- drop trigger if exists then create. Safe to apply via `supabase db push`
-- or by pasting into the Supabase SQL editor multiple times.
--
-- Every table is scoped to the owning auth user. Row Level Security is enabled
-- on all tables with a per-table owner policy:
--   * profiles:  id      = auth.uid()
--   * all others: user_id = auth.uid()
-- ============================================================================

-- gen_random_uuid() is in core Postgres 13+, but enable pgcrypto defensively.
create extension if not exists pgcrypto;

-- ============================================================================
-- 1) profiles  (1:1 with auth.users; id = auth.uid())
-- ============================================================================
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  unit         text not null default 'lb' check (unit in ('lb', 'kg')),
  start_date   date,
  deload_week  int  not null default 5,
  created_at   timestamptz default now()
);

-- ============================================================================
-- 2) programs
-- ============================================================================
create table if not exists public.programs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  name         text not null,
  length_weeks int  not null default 5,
  deload_week  int  not null default 5,
  is_active    boolean not null default true,
  created_at   timestamptz default now()
);

-- ============================================================================
-- 3) program_days
-- ============================================================================
create table if not exists public.program_days (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  user_id    uuid not null,
  day_number int  not null,
  label      text not null
);

-- ============================================================================
-- 4) exercise_slots
-- ============================================================================
create table if not exists public.exercise_slots (
  id             uuid primary key default gen_random_uuid(),
  day_id         uuid not null references public.program_days (id) on delete cascade,
  user_id        uuid not null,
  slot_code      text not null,
  order_index    int  not null,
  exercise_name  text not null,
  muscle_area    text,
  progress_bias  text not null check (progress_bias in ('Load +5', 'Reps first', 'Set optional')),
  rep_low        int  not null,
  rep_high       int  not null,
  target_rir     numeric not null default 3,
  base_sets      int  not null,
  load_increment numeric not null default 5,
  seed_load      numeric
);

-- ============================================================================
-- 5) sessions
-- ============================================================================
create table if not exists public.sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  program_id   uuid not null references public.programs (id) on delete cascade,
  day_id       uuid not null references public.program_days (id) on delete cascade,
  week         int  not null,
  performed_at timestamptz,
  status       text not null default 'planned' check (status in ('planned', 'in_progress', 'done', 'skipped')),
  created_at   timestamptz default now()
);

-- ============================================================================
-- 6) set_logs
-- ============================================================================
create table if not exists public.set_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null,
  session_id       uuid not null references public.sessions (id) on delete cascade,
  slot_id          uuid not null references public.exercise_slots (id) on delete cascade,
  week             int  not null,
  actual_load      numeric,
  best_reps        int,
  actual_sets      int,
  actual_rir       numeric,
  hit_rir_override text check (hit_rir_override in ('Y', 'N', 'Skip')),
  pump             int,
  enjoyment        int,
  soreness         int,
  recovery         int,
  performance      text check (performance in ('Up', 'Same', 'Down')),
  notes            text,
  created_at       timestamptz default now()
);

-- ============================================================================
-- 7) body_metrics  (one row per user per day)
-- ============================================================================
create table if not exists public.body_metrics (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  measured_on date not null,
  bodyweight  numeric,
  bodyfat_pct numeric,
  notes       text,
  created_at  timestamptz default now(),
  unique (user_id, measured_on)
);

-- ============================================================================
-- 8) blocks  (training or diet phases)
-- ============================================================================
create table if not exists public.blocks (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  kind           text not null check (kind in ('training', 'diet')),
  name           text not null,
  goal           text,
  phase          text,
  start_date     date,
  end_date       date,
  length_weeks   int,
  program_id     uuid references public.programs (id) on delete set null,
  calorie_target int,
  protein_target int,
  carb_target    int,
  fat_target     int,
  is_active      boolean not null default false,
  notes          text,
  created_at     timestamptz default now()
);

-- ============================================================================
-- 9) goals
-- ============================================================================
create table if not exists public.goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  title         text not null,
  metric_type   text not null check (metric_type in ('bodyweight', 'bodyfat', 'e1rm', 'volume', 'custom')),
  exercise_name text,
  start_value   numeric,
  target_value  numeric,
  target_unit   text,
  target_date   date,
  status        text not null default 'active' check (status in ('active', 'achieved', 'abandoned')),
  notes         text,
  created_at    timestamptz default now()
);

-- ============================================================================
-- 10) nutrition_logs  (one row per user per day)
-- ============================================================================
create table if not exists public.nutrition_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  logged_on  date not null,
  calories   int,
  protein    int,
  carbs      int,
  fat        int,
  notes      text,
  created_at timestamptz default now(),
  unique (user_id, logged_on)
);

-- ============================================================================
-- Row Level Security — enable on every table
-- ============================================================================
alter table public.profiles       enable row level security;
alter table public.programs       enable row level security;
alter table public.program_days   enable row level security;
alter table public.exercise_slots enable row level security;
alter table public.sessions       enable row level security;
alter table public.set_logs       enable row level security;
alter table public.body_metrics   enable row level security;
alter table public.blocks         enable row level security;
alter table public.goals          enable row level security;
alter table public.nutrition_logs enable row level security;

-- ============================================================================
-- Policies — one owner policy per table covering select/insert/update/delete.
-- `FOR ALL` with USING + WITH CHECK enforces ownership on reads and writes.
-- Drop-then-create keeps this re-runnable.
-- ============================================================================

-- profiles: predicate is id = auth.uid()
drop policy if exists "profiles_owner" on public.profiles;
create policy "profiles_owner" on public.profiles
  for all
  using (id = auth.uid())
  with check (id = auth.uid());

-- programs
drop policy if exists "programs_owner" on public.programs;
create policy "programs_owner" on public.programs
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- program_days
drop policy if exists "program_days_owner" on public.program_days;
create policy "program_days_owner" on public.program_days
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- exercise_slots
drop policy if exists "exercise_slots_owner" on public.exercise_slots;
create policy "exercise_slots_owner" on public.exercise_slots
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- sessions
drop policy if exists "sessions_owner" on public.sessions;
create policy "sessions_owner" on public.sessions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- set_logs
drop policy if exists "set_logs_owner" on public.set_logs;
create policy "set_logs_owner" on public.set_logs
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- body_metrics
drop policy if exists "body_metrics_owner" on public.body_metrics;
create policy "body_metrics_owner" on public.body_metrics
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- blocks
drop policy if exists "blocks_owner" on public.blocks;
create policy "blocks_owner" on public.blocks
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- goals
drop policy if exists "goals_owner" on public.goals;
create policy "goals_owner" on public.goals
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- nutrition_logs
drop policy if exists "nutrition_logs_owner" on public.nutrition_logs;
create policy "nutrition_logs_owner" on public.nutrition_logs
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================================
-- Trigger — auto-create a profile row when a new auth user is created.
-- SECURITY DEFINER so it can write to public.profiles bypassing RLS.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ============================================================================
-- Indexes
--   * user_id on every owned table
--   * the foreign-key / hot-path lookups used by the data layer
-- ============================================================================

-- user_id indexes (profiles.id is already the PK, so it is indexed)
create index if not exists idx_programs_user        on public.programs (user_id);
create index if not exists idx_program_days_user     on public.program_days (user_id);
create index if not exists idx_exercise_slots_user   on public.exercise_slots (user_id);
create index if not exists idx_sessions_user         on public.sessions (user_id);
create index if not exists idx_set_logs_user         on public.set_logs (user_id);
create index if not exists idx_body_metrics_user     on public.body_metrics (user_id);
create index if not exists idx_blocks_user           on public.blocks (user_id);
create index if not exists idx_goals_user            on public.goals (user_id);
create index if not exists idx_nutrition_logs_user   on public.nutrition_logs (user_id);

-- foreign-key / lookup indexes
create index if not exists idx_program_days_program    on public.program_days (program_id);
create index if not exists idx_exercise_slots_day_order on public.exercise_slots (day_id, order_index);
create index if not exists idx_sessions_program_week    on public.sessions (program_id, week);
create index if not exists idx_set_logs_session         on public.set_logs (session_id);
create index if not exists idx_set_logs_slot            on public.set_logs (slot_id);
create index if not exists idx_body_metrics_user_date   on public.body_metrics (user_id, measured_on);
create index if not exists idx_nutrition_logs_user_date on public.nutrition_logs (user_id, logged_on);
create index if not exists idx_blocks_program           on public.blocks (program_id);

-- ============================================================================
-- end 0001_init.sql
-- ============================================================================
