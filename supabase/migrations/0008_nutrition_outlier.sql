-- ============================================================================
-- simplegym — persist the deficit outlier filter (0008)
-- ----------------------------------------------------------------------------
-- The nutrition deficit tracker can ignore under-logged completed days. Persist
-- that per user (syncs across devices) as a single nullable int:
--   null  = filter OFF
--   value = ignore completed days under this many calories
-- Default 1200 (on), matching the previous client default. Idempotent.
-- ============================================================================

alter table public.profiles
  add column if not exists nutrition_min_calories int default 1200;

-- ============================================================================
-- end 0008_nutrition_outlier.sql
-- ============================================================================
