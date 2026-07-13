-- Strength is a weak proxy for body composition, so keep its influence on the
-- body-fat estimate explicitly opt-in. Existing and new profiles default off.
alter table public.profiles
  add column if not exists bodyfat_lift_compensation boolean not null default false;
