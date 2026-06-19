-- ============================================================================
-- 0003 — per-set logging
-- One row per actual set (load/reps/rir). The set_logs row stays as the per-slot
-- readiness + notes holder, and its actual_load/best_reps/actual_sets/actual_rir
-- become a derived cache recomputed from these entries on save — so the engine,
-- history and progress keep reading the same aggregate unchanged.
-- Additive + idempotent.
-- ============================================================================

create table if not exists public.set_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  session_id  uuid not null references public.sessions (id) on delete cascade,
  slot_id     uuid not null references public.exercise_slots (id) on delete cascade,
  set_number  int  not null,
  load        numeric,
  reps        int,
  rir         numeric,
  created_at  timestamptz default now(),
  unique (session_id, slot_id, set_number)
);

create index if not exists set_entries_user_idx on public.set_entries (user_id);
create index if not exists set_entries_session_slot_idx
  on public.set_entries (session_id, slot_id, set_number);

alter table public.set_entries enable row level security;

drop policy if exists "set_entries owner" on public.set_entries;
create policy "set_entries owner" on public.set_entries
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
