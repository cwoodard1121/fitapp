-- Allow multiple tape readings during an ISO week. body_metrics already has a
-- unique (user_id, measured_on) constraint, so a user can still store at most
-- one Navy reading per calendar day. The app averages accepted readings for
-- the week and excludes estimates more than 20% from their non-Navy BIA
-- reference.
drop index if exists public.uniq_body_metrics_weekly_navy;

comment on column public.body_metrics.height_cm is
  'Height used for Navy circumference estimates, stored in centimetres.';
comment on column public.body_metrics.neck_cm is
  'Neck circumference for a Navy estimate, stored in centimetres.';
comment on column public.body_metrics.waist_cm is
  'Waist/abdomen circumference at the navel for a Navy estimate, stored in centimetres.';
comment on column public.body_metrics.navy_bodyfat_pct is
  'Male U.S. Navy circumference body-fat estimate; accepted daily estimates are averaged in the app by ISO week.';
