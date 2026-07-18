-- Height is a stable profile measurement. Weekly Navy tape rows retain a
-- snapshot so historical calculations remain reproducible if height changes.
alter table public.profiles
  add column if not exists height_cm numeric;

-- Preserve the height already entered with the most recent Navy tape.
update public.profiles as profile
   set height_cm = latest.height_cm
  from (
    select distinct on (user_id)
      user_id,
      height_cm
    from public.body_metrics
    where height_cm is not null
    order by user_id, measured_on desc
  ) as latest
 where profile.id = latest.user_id
   and profile.height_cm is null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'profiles_height_cm_range'
       and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_height_cm_range
      check (height_cm is null or height_cm between 100 and 250);
  end if;
end $$;

comment on column public.profiles.height_cm is
  'Canonical height in centimetres used by the Navy body-fat calculation.';
