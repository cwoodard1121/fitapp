-- ============================================================================
-- Optional weekly goal + build/break framing for daily habits
-- ----------------------------------------------------------------------------
-- goal_per_week: "do this N times a week" instead of the implicit "every
-- single day." Null (the default) keeps existing habits behaving exactly as
-- before — pure daily-streak framing, no weekly-progress readout.
--
-- kind: purely a copy/labeling switch, not a new data model. A completion
-- row already means "I succeeded that day" for either direction — 'build'
-- reads it as "did the thing" (e.g. Creatine), 'break' reads the identical
-- row as "avoided the thing" (e.g. No smoking). Defaults to 'build' so every
-- existing habit is unchanged.
-- ============================================================================

alter table public.habits
  add column if not exists goal_per_week smallint,
  add column if not exists kind text not null default 'build';

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.habits'::regclass
       and conname = 'habits_goal_per_week_range'
  ) then
    alter table public.habits
      add constraint habits_goal_per_week_range
      check (goal_per_week is null or goal_per_week between 1 and 7);
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.habits'::regclass
       and conname = 'habits_kind_check'
  ) then
    alter table public.habits
      add constraint habits_kind_check
      check (kind in ('build', 'break'));
  end if;
end;
$$;

comment on column public.habits.goal_per_week is
  'Optional target completions per rolling 7-day window. Null = plain daily streak, no weekly goal shown.';
comment on column public.habits.kind is
  'build = did the thing (e.g. Creatine), break = avoided the thing (e.g. No smoking). Labeling only — a completion row means "succeeded that day" either way.';
