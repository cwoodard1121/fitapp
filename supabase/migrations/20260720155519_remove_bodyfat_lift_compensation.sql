-- Lift strength is not a body-fat measurement. Remove the abandoned
-- compensation preference and its manual anchor table.
drop table if exists public.baseline_lifts;

alter table public.profiles
  drop column if exists bodyfat_lift_compensation;
