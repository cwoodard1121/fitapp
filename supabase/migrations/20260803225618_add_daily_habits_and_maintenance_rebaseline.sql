-- ============================================================================
-- Daily habits + maintenance-calibration epochs
-- ----------------------------------------------------------------------------
-- Habits are user-owned and completions are date-only app-calendar events.
-- Maintenance rebaselining advances an analysis boundary; it never removes
-- food logs, body readings, or the currently saved maintenance value.
-- ============================================================================

alter table public.profiles
  add column if not exists maintenance_calibration_started_at timestamptz,
  add column if not exists maintenance_calibration_reason text,
  add column if not exists maintenance_calibration_target int;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and conname = 'profiles_maintenance_calibration_reason_check'
  ) then
    alter table public.profiles
      add constraint profiles_maintenance_calibration_reason_check
      check (
        maintenance_calibration_reason is null
        or maintenance_calibration_reason in (
          'manual',
          'diet_target_change',
          'diet_block_change'
        )
      );
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and conname = 'profiles_maintenance_calibration_target_check'
  ) then
    alter table public.profiles
      add constraint profiles_maintenance_calibration_target_check
      check (
        maintenance_calibration_target is null
        or maintenance_calibration_target between 0 and 20000
      );
  end if;
end;
$$;

create table if not exists public.habits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  started_on  date not null,
  sort_order  int not null default 0 check (sort_order between 0 and 10000),
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.habit_completions (
  id           uuid primary key default gen_random_uuid(),
  habit_id     uuid not null,
  user_id      uuid not null references auth.users (id) on delete cascade,
  completed_on date not null,
  created_at   timestamptz not null default now(),
  constraint habit_completions_habit_owner_fkey
    foreign key (habit_id, user_id)
    references public.habits (id, user_id)
    on delete cascade,
  unique (habit_id, completed_on)
);

alter table public.habits enable row level security;
alter table public.habit_completions enable row level security;

drop policy if exists "habits_select_owner" on public.habits;
create policy "habits_select_owner"
  on public.habits
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "habits_insert_owner" on public.habits;
create policy "habits_insert_owner"
  on public.habits
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "habits_update_owner" on public.habits;
create policy "habits_update_owner"
  on public.habits
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "habit_completions_select_owner"
  on public.habit_completions;
create policy "habit_completions_select_owner"
  on public.habit_completions
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1
        from public.habits habit
       where habit.id = habit_completions.habit_id
         and habit.user_id = (select auth.uid())
    )
  );

drop policy if exists "habit_completions_insert_owner"
  on public.habit_completions;
create policy "habit_completions_insert_owner"
  on public.habit_completions
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
        from public.habits habit
       where habit.id = habit_completions.habit_id
         and habit.user_id = (select auth.uid())
         and habit.archived_at is null
         and habit.started_on <= habit_completions.completed_on
    )
  );

drop policy if exists "habit_completions_delete_owner"
  on public.habit_completions;
create policy "habit_completions_delete_owner"
  on public.habit_completions
  for delete
  to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1
        from public.habits habit
       where habit.id = habit_completions.habit_id
         and habit.user_id = (select auth.uid())
    )
  );

grant select, insert, update on table public.habits to authenticated;
grant select, insert, delete on table public.habit_completions to authenticated;

create unique index if not exists idx_habits_user_active_name
  on public.habits (user_id, lower(btrim(name)))
  where archived_at is null;

create index if not exists idx_habits_user_active_order
  on public.habits (user_id, sort_order, created_at)
  where archived_at is null;

create index if not exists idx_habit_completions_user_date
  on public.habit_completions (user_id, completed_on desc);

-- Active diet-target changes establish a new regime automatically. Because
-- this is an ordinary invoker trigger, the existing profile RLS policy still
-- requires the caller to own the affected profile.
create or replace function public.rebaseline_maintenance_on_diet_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  reset_reason text;
begin
  if new.kind <> 'diet' or not new.is_active then
    return new;
  end if;

  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and not old.is_active) then
    reset_reason := 'diet_block_change';
  elsif tg_op = 'UPDATE' and (
    new.calorie_target is distinct from old.calorie_target
    or new.carb_target is distinct from old.carb_target
    or new.phase is distinct from old.phase
  ) then
    reset_reason := 'diet_target_change';
  end if;

  if reset_reason is not null then
    update public.profiles
       set maintenance_calibration_started_at = now(),
           maintenance_calibration_reason = reset_reason,
           maintenance_calibration_target = new.calorie_target
     where id = new.user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists rebaseline_maintenance_on_diet_change
  on public.blocks;
create trigger rebaseline_maintenance_on_diet_change
  after insert or update of kind, is_active, phase, calorie_target, carb_target
  on public.blocks
  for each row
  execute function public.rebaseline_maintenance_on_diet_change();

-- Existing active diet blocks predate target-change epochs, so begin one clean
-- baseline at deployment. This is analysis-only; historical rows remain intact.
update public.profiles profile
   set maintenance_calibration_started_at = now(),
       maintenance_calibration_reason = 'diet_block_change',
       maintenance_calibration_target = active_diet.calorie_target
  from (
    select distinct on (user_id)
           user_id,
           calorie_target
      from public.blocks
     where kind = 'diet'
       and is_active = true
     order by user_id, start_date desc nulls last, created_at desc
  ) active_diet
 where profile.id = active_diet.user_id
   and profile.maintenance_calibration_started_at is null;

revoke execute
  on function public.rebaseline_maintenance_on_diet_change()
  from public, anon, authenticated;
