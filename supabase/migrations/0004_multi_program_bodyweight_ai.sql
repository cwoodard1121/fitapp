-- ============================================================================
-- 0004 — multiple programs, bodyweight progression, AI analysis
-- ----------------------------------------------------------------------------
-- Additive + idempotent (safe to re-run via `supabase db push` or pasted into
-- the SQL editor). Three independent changes bundled:
--
--   1) Per-program start date. Each program now carries its own start_date so
--      the "current week" follows whichever program is ACTIVE; a null start_date
--      means "unset / Week 1" for that program. Backfilled once from
--      profiles.start_date for the user's active program. profiles.start_date is
--      left in place but is no longer read for the week math.
--
--   2) Exactly one active program per user, switchable atomically. A partial
--      unique index makes is_active a hard single-active invariant; a
--      SECURITY INVOKER function flips the active program in one transaction so
--      the invariant is never violated mid-switch.
--
--   3) Bodyweight exercises. exercise_slots.is_bodyweight marks movements
--      (pull-ups, dips) the engine must progress by reps/sets only — never an
--      automatic load bump. The user can still type their own added weight.
--
--   4) ai_analyses — cached structured output from the (allowlisted) LLM
--      overview so several screens can read one analysis without re-calling.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) programs.start_date (per-program mesocycle anchor)
-- ----------------------------------------------------------------------------
alter table public.programs add column if not exists start_date date;

-- Backfill: seed each user's ACTIVE program start date from their profile so
-- existing users keep their current-week alignment after the switchover.
update public.programs p
   set start_date = pr.start_date
  from public.profiles pr
 where pr.id = p.user_id
   and p.is_active = true
   and p.start_date is null
   and pr.start_date is not null;

-- ----------------------------------------------------------------------------
-- 2) Single active program per user + atomic switch
-- ----------------------------------------------------------------------------
-- A user may OWN many programs but only one is_active=true at a time. The
-- partial unique index enforces that even under concurrent writes.
create unique index if not exists uniq_active_program_per_user
  on public.programs (user_id)
  where is_active;

-- Flip the caller's active program in one transaction: deactivate all, then
-- activate the target. Both statements are scoped to auth.uid() and the
-- intermediate state (zero active) satisfies the partial unique index, so the
-- switch never trips the constraint. SECURITY INVOKER -> RLS still applies.
create or replace function public.set_active_program(p_program_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count int;
begin
  update public.programs
     set is_active = false
   where user_id = auth.uid()
     and is_active = true;

  update public.programs
     set is_active = true
   where id = p_program_id
     and user_id = auth.uid();

  -- Guard: a non-owned/nonexistent id must never leave the user with zero
  -- active programs. Raising rolls back the whole function transaction
  -- (including the deactivate above), preserving the prior active program.
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'program % not found for user', p_program_id;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3) exercise_slots.is_bodyweight
-- ----------------------------------------------------------------------------
alter table public.exercise_slots
  add column if not exists is_bodyweight boolean not null default false;

-- Mark the genuinely bodyweight movements in any already-seeded default program
-- (pull-ups). Unseeded barbell lifts (squat/deadlift/bench) ALSO have a null
-- seed_load but are NOT bodyweight — they calibrate from week-1 logging — so we
-- scope strictly by name to avoid disabling their load progression.
update public.exercise_slots
   set is_bodyweight = true
 where is_bodyweight = false
   and seed_load is null
   and (exercise_name ilike 'pull-up%' or exercise_name ilike 'pullup%' or exercise_name ilike 'chin-up%');

-- ----------------------------------------------------------------------------
-- 4) ai_analyses — cached LLM overview (one current row per user is read; we
--    keep history rows too, newest wins on read).
-- ----------------------------------------------------------------------------
create table if not exists public.ai_analyses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  model       text,
  payload     jsonb not null,
  created_at  timestamptz default now()
);

alter table public.ai_analyses enable row level security;

drop policy if exists "ai_analyses_owner" on public.ai_analyses;
create policy "ai_analyses_owner" on public.ai_analyses
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists idx_ai_analyses_user_created
  on public.ai_analyses (user_id, created_at desc);

-- ============================================================================
-- end 0004_multi_program_bodyweight_ai.sql
-- ============================================================================
