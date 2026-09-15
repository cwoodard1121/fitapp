-- ============================================================================
-- Weekly Navy tape opt-out + remembered training week
-- ----------------------------------------------------------------------------
-- track_navy_bodyfat: lets an athlete without a tape measure turn off the
-- weekly Navy body-fat nag (Today) and the Navy readings card (Body). Existing
-- users default to true so today's behavior is unchanged until they opt out.
--
-- last_selected_week: the mesocycle week the athlete last tapped in the Today
-- week strip. When set, it overrides the calendar-derived "current" week on
-- return visits with no explicit ?week= in the URL; "Back to current" clears
-- it. Range-checked the same way deload_week/height_cm are.
-- ============================================================================

alter table public.profiles
  add column if not exists track_navy_bodyfat boolean not null default true,
  add column if not exists last_selected_week int;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'profiles_last_selected_week_range'
       and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_last_selected_week_range
      check (last_selected_week is null or last_selected_week between 1 and 52);
  end if;
end $$;

comment on column public.profiles.track_navy_bodyfat is
  'Whether the app prompts for and shows weekly Navy tape-measure body-fat readings. Off = no tape measure.';
comment on column public.profiles.last_selected_week is
  'Mesocycle week the athlete last picked in the Today week strip; null defers to the calendar-derived current week.';
