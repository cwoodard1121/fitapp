-- Weeks repeat inside a multi-mesocycle program. A schedule version changes
-- whenever the anchor or program length changes, while mesocycle identifies a
-- cycle inside that immutable schedule. Together they prevent old Week 1 rows
-- from reopening after rollover or a later schedule edit.

alter table public.programs
  add column if not exists schedule_version uuid;

update public.programs
   set schedule_version = gen_random_uuid()
 where schedule_version is null;

alter table public.programs
  alter column schedule_version set default gen_random_uuid(),
  alter column schedule_version set not null;

alter table public.sessions
  add column if not exists mesocycle int not null default 0,
  add column if not exists schedule_version uuid;

-- Backfill historical cycle numbers once, before attaching the immutable
-- schedule version. Later anchor edits rotate the version and never rewrite
-- these stored identities.
update public.sessions s
   set mesocycle = greatest(
     0,
     floor(
       ((coalesce(s.performed_at, s.created_at)::date - p.start_date)::numeric)
       / (greatest(1, p.length_weeks) * 7)
     )::int
   )
  from public.programs p
 where p.id = s.program_id
   and p.start_date is not null
   and s.schedule_version is null;

update public.sessions s
   set schedule_version = p.schedule_version
  from public.programs p
 where p.id = s.program_id
   and s.schedule_version is null;

alter table public.sessions
  alter column schedule_version set not null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'sessions_mesocycle_nonnegative'
       and conrelid = 'public.sessions'::regclass
  ) then
    alter table public.sessions
      add constraint sessions_mesocycle_nonnegative
      check (mesocycle >= 0);
  end if;
end;
$$;

create or replace function public.rotate_program_schedule_version()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.start_date is distinct from old.start_date
     or new.length_weeks is distinct from old.length_weeks
     or new.deload_week is distinct from old.deload_week then
    new.schedule_version := gen_random_uuid();
  end if;
  return new;
end;
$$;

drop trigger if exists rotate_program_schedule_version_on_timing_change
  on public.programs;
create trigger rotate_program_schedule_version_on_timing_change
before update of start_date, length_weeks, deload_week on public.programs
for each row
execute function public.rotate_program_schedule_version();

-- Preserve any legacy duplicate sessions and all of their logs, but move every
-- duplicate after the best canonical row onto its own historical version so
-- the new uniqueness guarantee can be installed without deleting training.
with ranked_sessions as (
  select
    id,
    row_number() over (
      partition by user_id, program_id, schedule_version, mesocycle, week, day_id
      order by
        case status
          when 'done' then 0
          when 'in_progress' then 1
          when 'planned' then 2
          else 3
        end,
        performed_at desc nulls last,
        created_at desc nulls last,
        id
    ) as duplicate_rank
  from public.sessions
)
update public.sessions s
   set schedule_version = gen_random_uuid()
  from ranked_sessions ranked
 where ranked.id = s.id
   and ranked.duplicate_rank > 1;

create unique index if not exists sessions_schedule_cycle_day_unique
  on public.sessions (
    user_id,
    program_id,
    schedule_version,
    mesocycle,
    week,
    day_id
  );
