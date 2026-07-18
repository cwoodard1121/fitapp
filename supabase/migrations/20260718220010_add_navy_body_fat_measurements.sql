-- Preserve the original body-fat stream as raw BIA readings, then add the
-- measurements needed for the male U.S. Navy circumference estimate. The
-- interpreted 65% Navy / 35% seven-day BIA-median value is derived in the app
-- because a new BIA reading can change the trailing median.
alter table public.body_metrics
  add column if not exists bia_bodyfat_pct numeric,
  add column if not exists height_cm numeric,
  add column if not exists neck_cm numeric,
  add column if not exists waist_cm numeric,
  add column if not exists navy_bodyfat_pct numeric;

-- Every body-fat value stored before this migration came from BIA. Keep the
-- legacy column populated for older clients while the new app reads the
-- explicitly named BIA column first.
update public.body_metrics
   set bia_bodyfat_pct = bodyfat_pct
 where bia_bodyfat_pct is null
   and bodyfat_pct is not null;

-- Enforce one Navy tape per ISO-style Monday-starting week, including under
-- concurrent writes. Daily BIA/weight-only rows are unaffected.
create unique index if not exists uniq_body_metrics_weekly_navy
  on public.body_metrics (
    user_id,
    date_trunc('week', measured_on::timestamp)
  )
  where navy_bodyfat_pct is not null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'body_metrics_bia_bodyfat_range'
       and conrelid = 'public.body_metrics'::regclass
  ) then
    alter table public.body_metrics
      add constraint body_metrics_bia_bodyfat_range
      check (bia_bodyfat_pct is null or bia_bodyfat_pct between 1 and 75);
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'body_metrics_height_range'
       and conrelid = 'public.body_metrics'::regclass
  ) then
    alter table public.body_metrics
      add constraint body_metrics_height_range
      check (height_cm is null or height_cm between 100 and 250);
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'body_metrics_neck_range'
       and conrelid = 'public.body_metrics'::regclass
  ) then
    alter table public.body_metrics
      add constraint body_metrics_neck_range
      check (neck_cm is null or neck_cm between 15 and 100);
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'body_metrics_waist_range'
       and conrelid = 'public.body_metrics'::regclass
  ) then
    alter table public.body_metrics
      add constraint body_metrics_waist_range
      check (waist_cm is null or waist_cm between 30 and 250);
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'body_metrics_navy_bodyfat_range'
       and conrelid = 'public.body_metrics'::regclass
  ) then
    alter table public.body_metrics
      add constraint body_metrics_navy_bodyfat_range
      check (navy_bodyfat_pct is null or navy_bodyfat_pct between 1 and 75);
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'body_metrics_tape_measurements_complete'
       and conrelid = 'public.body_metrics'::regclass
  ) then
    alter table public.body_metrics
      add constraint body_metrics_tape_measurements_complete
      check (
        (height_cm is null and neck_cm is null and waist_cm is null and navy_bodyfat_pct is null)
        or
        (
          height_cm is not null
          and neck_cm is not null
          and waist_cm is not null
          and navy_bodyfat_pct is not null
          and waist_cm > neck_cm
        )
      );
  end if;
end $$;

comment on column public.body_metrics.bodyfat_pct is
  'Legacy BIA body-fat field retained for compatibility; mirrors bia_bodyfat_pct on new writes.';
comment on column public.body_metrics.bia_bodyfat_pct is
  'Raw bioelectrical impedance body-fat percentage.';
comment on column public.body_metrics.height_cm is
  'Height used for the weekly Navy circumference estimate, stored in centimetres.';
comment on column public.body_metrics.neck_cm is
  'Weekly neck circumference, stored in centimetres.';
comment on column public.body_metrics.waist_cm is
  'Weekly waist/abdomen circumference at the navel, stored in centimetres.';
comment on column public.body_metrics.navy_bodyfat_pct is
  'Male U.S. Navy circumference body-fat estimate computed from height, neck, and waist.';
