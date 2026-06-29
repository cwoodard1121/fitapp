-- ============================================================================
-- simplegym — import source tracking (0006_import_source.sql)
-- ----------------------------------------------------------------------------
-- Mark whether a daily nutrition / body row was entered MANUALLY in the app or
-- imported from a WEARABLE, so the wearable sync NEVER overwrites manual data
-- (manual always wins). Existing rows default to 'manual' so historical hand-
-- entered data is protected; the wearable writes 'wearable' and only updates
-- rows that are new or previously wearable-sourced.
--
-- Idempotent + re-runnable. recovery_metrics already carries its own `source`.
-- ============================================================================

alter table public.nutrition_logs
  add column if not exists source text not null default 'manual';

alter table public.body_metrics
  add column if not exists source text not null default 'manual';

-- ============================================================================
-- end 0006_import_source.sql
-- ============================================================================
