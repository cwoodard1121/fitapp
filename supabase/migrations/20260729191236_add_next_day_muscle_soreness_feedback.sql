-- ============================================================================
-- Next-day muscle soreness feedback
-- ----------------------------------------------------------------------------
-- Soreness is collected once per trained muscle area on the day after a
-- completed session. It is deliberately separate from set_logs: pump and
-- performance are immediate exercise feedback, while soreness is a later,
-- low-confidence recovery/stimulus signal.
-- ============================================================================

create table if not exists public.muscle_soreness_checkins (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  session_id  uuid not null references public.sessions (id) on delete cascade,
  muscle_area text not null check (char_length(btrim(muscle_area)) between 1 and 40),
  soreness    int not null check (soreness between 0 and 10),
  checked_on  date not null default current_date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (session_id, muscle_area)
);

alter table public.muscle_soreness_checkins enable row level security;

drop policy if exists "muscle_soreness_checkins_owner"
  on public.muscle_soreness_checkins;
drop policy if exists "muscle_soreness_checkins_select_owner"
  on public.muscle_soreness_checkins;
drop policy if exists "muscle_soreness_checkins_insert_logged_muscle"
  on public.muscle_soreness_checkins;
drop policy if exists "muscle_soreness_checkins_update_logged_muscle"
  on public.muscle_soreness_checkins;
drop policy if exists "muscle_soreness_checkins_delete_owner"
  on public.muscle_soreness_checkins;

-- Existing feedback stays readable/deletable even if a future program edit
-- retires or renames the source slot.
create policy "muscle_soreness_checkins_select_owner"
  on public.muscle_soreness_checkins
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1
        from public.sessions s
       where s.id = muscle_soreness_checkins.session_id
         and s.user_id = (select auth.uid())
    )
  );

create policy "muscle_soreness_checkins_delete_owner"
  on public.muscle_soreness_checkins
  for delete
  to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1
        from public.sessions s
       where s.id = muscle_soreness_checkins.session_id
         and s.user_id = (select auth.uid())
    )
  );

create policy "muscle_soreness_checkins_insert_logged_muscle"
  on public.muscle_soreness_checkins
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
        from public.sessions s
        join public.set_logs log
          on log.session_id = s.id
         and log.user_id = s.user_id
        join public.exercise_slots slot
          on slot.id = log.slot_id
         and slot.user_id = s.user_id
       where s.id = muscle_soreness_checkins.session_id
         and s.user_id = (select auth.uid())
         and s.status = 'done'
         and lower(regexp_replace(
               btrim(slot.muscle_area),
               '[[:space:]]+',
               ' ',
               'g'
             )) = lower(regexp_replace(
               btrim(muscle_soreness_checkins.muscle_area),
               '[[:space:]]+',
               ' ',
               'g'
             ))
         and (
           log.actual_load is not null
           or log.best_reps is not null
           or log.actual_sets is not null
           or log.actual_rir is not null
         )
      )
  );

create policy "muscle_soreness_checkins_update_logged_muscle"
  on public.muscle_soreness_checkins
  for update
  to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1
        from public.sessions s
       where s.id = muscle_soreness_checkins.session_id
         and s.user_id = (select auth.uid())
    )
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
        from public.sessions s
        join public.set_logs log
          on log.session_id = s.id
         and log.user_id = s.user_id
        join public.exercise_slots slot
          on slot.id = log.slot_id
         and slot.user_id = s.user_id
       where s.id = muscle_soreness_checkins.session_id
         and s.user_id = (select auth.uid())
         and s.status = 'done'
         and lower(regexp_replace(
               btrim(slot.muscle_area),
               '[[:space:]]+',
               ' ',
               'g'
             )) = lower(regexp_replace(
               btrim(muscle_soreness_checkins.muscle_area),
               '[[:space:]]+',
               ' ',
               'g'
             ))
         and (
           log.actual_load is not null
           or log.best_reps is not null
           or log.actual_sets is not null
           or log.actual_rir is not null
         )
    )
  );

-- Public-schema tables are no longer guaranteed to be exposed to the Data API
-- automatically. Grant only the authenticated role; RLS still scopes every row.
grant select, insert, update, delete
  on table public.muscle_soreness_checkins
  to authenticated;

create index if not exists idx_muscle_soreness_checkins_user_date
  on public.muscle_soreness_checkins (user_id, checked_on desc);

create index if not exists idx_muscle_soreness_checkins_session
  on public.muscle_soreness_checkins (session_id);
