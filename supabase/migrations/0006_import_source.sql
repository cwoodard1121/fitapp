-- ============================================================================
-- simplegym — import source tracking (0006_import_source.sql)
-- ----------------------------------------------------------------------------
-- Mark whether a daily nutrition / body row was entered MANUALLY in the app or
-- imported from a WEARABLE, so the wearable sync NEVER overwrites manual data
-- (manual always wins). The wearable writes 'wearable' and only updates rows
-- that are new or previously wearable-sourced; a 'manual' row is skipped.
--
-- BACKFILL of the source on FIRST run only (re-run-safe via the column-exists
-- guard): the wearable era starts 2026-06-20 (the earliest Fitbit import). Rows
-- on/after that date are tagged 'wearable' so the sync + history backfill keep
-- them fresh; OLDER rows are 'manual' and protected from the wearable forever.
-- (Without this one-time tag, rows the wearable already wrote BEFORE this
-- migration would default to 'manual' and freeze.)
--
-- recovery_metrics already carries its own `source`; it is unaffected.
-- ============================================================================

-- The cutover date for the wearable era (the user's earliest Fitbit import).
-- Used only by the one-time first-run backfill below.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'nutrition_logs' and column_name = 'source'
  ) then
    alter table public.nutrition_logs add column source text not null default 'manual';
    update public.nutrition_logs set source = 'wearable' where logged_on >= date '2026-06-20';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'body_metrics' and column_name = 'source'
  ) then
    alter table public.body_metrics add column source text not null default 'manual';
    update public.body_metrics set source = 'wearable' where measured_on >= date '2026-06-20';
  end if;
end $$;

-- ============================================================================
-- end 0006_import_source.sql
-- ============================================================================
