-- ============================================================================
-- simplegym — configurable maintenance step baseline (0007)
-- ----------------------------------------------------------------------------
-- The activity-adjusted deficit assumes your maintenance holds at a given
-- steps/day level; days under it trim that day's burn. Make that baseline a
-- per-user setting (null = the app default of 10000). Idempotent.
-- ============================================================================

alter table public.profiles
  add column if not exists maintenance_step_baseline int;

-- ============================================================================
-- end 0007_maintenance_step_baseline.sql
-- ============================================================================
