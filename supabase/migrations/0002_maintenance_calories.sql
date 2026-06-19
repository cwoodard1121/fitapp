-- ============================================================================
-- 0002 — maintenance calories (weekly deficit tracker)
-- Additive + idempotent so it applies cleanly to an existing database.
-- ============================================================================

-- Basis for the Nutrition weekly-deficit tracker.
alter table public.profiles
  add column if not exists maintenance_calories int;

-- Defensive: ensure the tuned-readiness-weights column exists on older deploys.
alter table public.profiles
  add column if not exists readiness_weights jsonb;
