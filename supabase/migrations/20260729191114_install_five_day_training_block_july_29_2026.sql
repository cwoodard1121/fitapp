-- Install Cameron's canonical five-day program and start its training block on
-- 2026-07-29 without deleting program/session history or touching diet/body
-- blocks.
--
-- Historical programs are archived (hidden from current-program pickers) rather
-- than deleted because sessions -> programs/days/slots use cascading foreign
-- keys. This week's completed Day 1/Day 2 sessions are re-homed in place and
-- matching logs are pointed at the new canonical slots, avoiding duplicate
-- history rows. App-side exercise aliases carry all older lift progression
-- across renamed slots.

alter table public.programs
  add column if not exists archived_at timestamptz;

create index if not exists idx_programs_user_unarchived_created
  on public.programs (user_id, created_at desc)
  where archived_at is null;

-- Archived programs must not be reactivated through the normal RPC.
create or replace function public.set_active_program(p_program_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count int;
begin
  update public.programs
     set is_active = false
   where user_id = auth.uid()
     and is_active = true;

  update public.programs
     set is_active = true
   where id = p_program_id
     and user_id = auth.uid()
     and archived_at is null;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'active program % not found for user', p_program_id;
  end if;
end;
$$;

do $$
declare
  v_user_id uuid;
  v_program_id uuid;
  v_prior_program_id uuid;
  v_day_id uuid;
  v_day_1_id uuid;
  v_day_2_id uuid;
  v_day_1_session_id uuid;
  v_day_2_session_id uuid;
  v_training_block_id uuid;
  v_mapped record;
  v_changed_at timestamptz := now();
begin
  select id
    into v_user_id
    from auth.users
   where lower(email) = lower('cameronwoodard1121@gmail.com')
   order by created_at
   limit 1;

  -- Preview/local databases intentionally have no production auth user.
  if v_user_id is null then
    raise notice 'FitApp user not present; skipping five-day program install.';
    return;
  end if;

  -- Capture the exact routine being replaced before any active flags change.
  -- Grandfathering must never pull a recent session from an inactive/test plan.
  select p.id
    into v_prior_program_id
    from public.programs p
   where p.user_id = v_user_id
     and p.is_active = true
   order by p.created_at desc
   limit 1;

  -- A replay finds the exact installed program instead of creating a duplicate.
  select p.id
    into v_program_id
    from public.programs p
   where p.user_id = v_user_id
     and p.name = 'Five-Day Progression'
     and p.start_date = date '2026-07-29'
     and p.archived_at is null
     and exists (
       select 1
         from public.program_days d
        where d.program_id = p.id
          and d.day_number = 5
          and d.label = 'Day 5 · Shoulders / Back / Forearms'
     )
   order by p.created_at desc
   limit 1;

  -- Deactivate first to satisfy the one-active-program partial unique index.
  update public.programs
     set is_active = false
   where user_id = v_user_id
     and is_active = true
     and (v_program_id is null or id <> v_program_id);

  if v_program_id is null then
    insert into public.programs (
      user_id,
      name,
      length_weeks,
      deload_week,
      is_active,
      start_date,
      archived_at
    ) values (
      v_user_id,
      'Five-Day Progression',
      5,
      5,
      true,
      date '2026-07-29',
      null
    )
    returning id into v_program_id;

    insert into public.program_days (program_id, user_id, day_number, label)
    values (v_program_id, v_user_id, 1, 'Day 1 · Chest / Back')
    returning id into v_day_id;
    v_day_1_id := v_day_id;

    insert into public.exercise_slots (
      day_id, user_id, slot_code, order_index, exercise_name, muscle_area,
      progress_bias, rep_low, rep_high, target_rir, base_sets,
      load_increment, seed_load, is_bodyweight
    ) values
      (v_day_id, v_user_id, 'D1A1', 0, 'Barbell Bench Press', 'Chest',
       'Reps first', 5, 10, 2, 2, 5, null, false),
      (v_day_id, v_user_id, 'D1A2', 1, 'Incline Dumbbell Bench Press', 'Upper chest',
       'Reps first', 6, 12, 2, 2, 5, null, false),
      (v_day_id, v_user_id, 'D1A3', 2, 'Pull-Up', 'Back',
       'Reps first', 5, 20, 0, 2, 5, null, true),
      (v_day_id, v_user_id, 'D1A4', 3, 'Barbell Row', 'Back',
       'Reps first', 6, 10, 2, 2, 5, null, false),
      (v_day_id, v_user_id, 'D1A5', 4, 'Dumbbell Lateral Raise', 'Side delts',
       'Reps first', 8, 15, 2, 2, 2.5, null, false),
      (v_day_id, v_user_id, 'D1A6', 5, 'Dumbbell Wrist Curl', 'Forearms',
       'Reps first', 10, 20, 2, 3, 2.5, null, false);

    insert into public.program_days (program_id, user_id, day_number, label)
    values (v_program_id, v_user_id, 2, 'Day 2 · Arms')
    returning id into v_day_id;
    v_day_2_id := v_day_id;

    insert into public.exercise_slots (
      day_id, user_id, slot_code, order_index, exercise_name, muscle_area,
      progress_bias, rep_low, rep_high, target_rir, base_sets,
      load_increment, seed_load, is_bodyweight
    ) values
      (v_day_id, v_user_id, 'D2A1', 0, 'EZ-Bar Curl', 'Biceps',
       'Reps first', 6, 12, 2, 4, 2.5, null, false),
      (v_day_id, v_user_id, 'D2A2', 1, 'Triceps Pushdown', 'Triceps',
       'Reps first', 6, 10, 2, 3, 2.5, null, false),
      (v_day_id, v_user_id, 'D2A3', 2, 'Cable Reverse Curl', 'Biceps / forearms',
       'Reps first', 8, 15, 2, 3, 2.5, null, false),
      (v_day_id, v_user_id, 'D2A4', 3, 'Cable Crunch', 'Abs',
       'Reps first', 8, 15, 2, 2, 5, null, false);

    insert into public.program_days (program_id, user_id, day_number, label)
    values (v_program_id, v_user_id, 3, 'Day 3 · Back / Chest / Shoulders')
    returning id into v_day_id;

    insert into public.exercise_slots (
      day_id, user_id, slot_code, order_index, exercise_name, muscle_area,
      progress_bias, rep_low, rep_high, target_rir, base_sets,
      load_increment, seed_load, is_bodyweight
    ) values
      (v_day_id, v_user_id, 'D3A1', 0, 'Pull-Up', 'Back',
       'Reps first', 5, 20, 0, 2, 5, null, true),
      (v_day_id, v_user_id, 'D3A2', 1, 'Barbell Row', 'Back',
       'Reps first', 6, 10, 2, 2, 5, null, false),
      (v_day_id, v_user_id, 'D3A3', 2, 'Incline Dumbbell Bench Press', 'Upper chest',
       'Reps first', 6, 12, 2, 2, 5, null, false),
      (v_day_id, v_user_id, 'D3A4', 3, 'Cable Lateral Raise', 'Side delts',
       'Reps first', 8, 15, 2, 2, 2.5, null, false);

    insert into public.program_days (program_id, user_id, day_number, label)
    values (v_program_id, v_user_id, 4, 'Day 4 · Legs / Arms')
    returning id into v_day_id;

    insert into public.exercise_slots (
      day_id, user_id, slot_code, order_index, exercise_name, muscle_area,
      progress_bias, rep_low, rep_high, target_rir, base_sets,
      load_increment, seed_load, is_bodyweight
    ) values
      (v_day_id, v_user_id, 'D4A1', 0, 'Barbell Squat', 'Quads',
       'Reps first', 6, 12, 2, 3, 5, null, false),
      (v_day_id, v_user_id, 'D4A2', 1, 'Deadlift', 'Hamstrings',
       'Reps first', 5, 8, 2, 2, 5, null, false),
      (v_day_id, v_user_id, 'D4A3', 2, 'Incline Dumbbell Curl', 'Biceps',
       'Reps first', 10, 15, 2, 3, 2.5, null, false),
      (v_day_id, v_user_id, 'D4A4', 3, 'Skull Crusher', 'Triceps',
       'Reps first', 10, 15, 2, 2, 2.5, null, false);

    insert into public.program_days (program_id, user_id, day_number, label)
    values (v_program_id, v_user_id, 5, 'Day 5 · Shoulders / Back / Forearms')
    returning id into v_day_id;

    insert into public.exercise_slots (
      day_id, user_id, slot_code, order_index, exercise_name, muscle_area,
      progress_bias, rep_low, rep_high, target_rir, base_sets,
      load_increment, seed_load, is_bodyweight
    ) values
      (v_day_id, v_user_id, 'D5A1', 0, 'Cable Lateral Raise', 'Side delts',
       'Reps first', 10, 15, 2, 3, 2.5, null, false),
      (v_day_id, v_user_id, 'D5A2', 1, 'Seated Dumbbell Lateral Raise', 'Side delts',
       'Reps first', 6, 12, 2, 2, 2.5, null, false),
      (v_day_id, v_user_id, 'D5A3', 2, 'Pull-Up', 'Back',
       'Reps first', 5, 20, 0, 2, 5, null, true),
      (v_day_id, v_user_id, 'D5A4', 3, 'Dumbbell Wrist Curl', 'Forearms',
       'Reps first', 10, 15, 2, 3, 2.5, null, false);
  else
    update public.programs
       set name = 'Five-Day Progression',
           length_weeks = 5,
           deload_week = 5,
           start_date = date '2026-07-29',
           archived_at = null,
           is_active = true
     where id = v_program_id
       and user_id = v_user_id;

    select id
      into v_day_1_id
      from public.program_days
     where program_id = v_program_id
       and user_id = v_user_id
       and day_number = 1
     limit 1;

    select id
      into v_day_2_id
      from public.program_days
     where program_id = v_program_id
       and user_id = v_user_id
       and day_number = 2
     limit 1;
  end if;

  -- Hide every previous template while retaining all of its dependent history.
  update public.programs
     set is_active = false,
         archived_at = coalesce(archived_at, v_changed_at)
   where user_id = v_user_id
     and id <> v_program_id;

  -- Re-home the already completed sessions from the prior block's current
  -- training week (the July 11 block's Week 3 began July 25 in Toronto). If a
  -- source session cannot be found, create a completed placeholder so the app
  -- still opens on Day 3 as explicitly requested.
  select id
    into v_day_1_session_id
    from public.sessions
   where user_id = v_user_id
     and program_id = v_program_id
     and day_id = v_day_1_id
     and week = 1
   order by created_at
   limit 1;

  if v_day_1_session_id is null then
    select s.id
      into v_day_1_session_id
      from public.sessions s
      join public.program_days d on d.id = s.day_id
     where s.user_id = v_user_id
       and s.program_id = v_prior_program_id
       and d.day_number = 1
       and coalesce(s.performed_at, s.created_at)
             >= timestamptz '2026-07-25 00:00:00-04'
       and (
         s.status in ('done', 'in_progress')
         or exists (
           select 1
             from public.set_logs l
            where l.session_id = s.id
              and (
                l.actual_load is not null
                or l.best_reps is not null
                or l.actual_sets is not null
                or l.actual_rir is not null
              )
         )
       )
     order by coalesce(s.performed_at, s.created_at) desc
     limit 1;

    if v_day_1_session_id is null then
      insert into public.sessions (
        user_id, program_id, day_id, week, performed_at, status
      ) values (
        v_user_id, v_program_id, v_day_1_id, 1, v_changed_at, 'done'
      )
      returning id into v_day_1_session_id;
    else
      update public.sessions
         set program_id = v_program_id,
             day_id = v_day_1_id,
             week = 1,
             performed_at = coalesce(performed_at, v_changed_at),
             status = 'done'
       where id = v_day_1_session_id
         and user_id = v_user_id;
    end if;
  end if;

  select id
    into v_day_2_session_id
    from public.sessions
   where user_id = v_user_id
     and program_id = v_program_id
     and day_id = v_day_2_id
     and week = 1
   order by created_at
   limit 1;

  if v_day_2_session_id is null then
    select s.id
      into v_day_2_session_id
      from public.sessions s
      join public.program_days d on d.id = s.day_id
     where s.user_id = v_user_id
       and s.program_id = v_prior_program_id
       and d.day_number = 2
       and coalesce(s.performed_at, s.created_at)
             >= timestamptz '2026-07-25 00:00:00-04'
       and (
         s.status in ('done', 'in_progress')
         or exists (
           select 1
             from public.set_logs l
            where l.session_id = s.id
              and (
                l.actual_load is not null
                or l.best_reps is not null
                or l.actual_sets is not null
                or l.actual_rir is not null
              )
         )
       )
     order by coalesce(s.performed_at, s.created_at) desc
     limit 1;

    if v_day_2_session_id is null then
      insert into public.sessions (
        user_id, program_id, day_id, week, performed_at, status
      ) values (
        v_user_id, v_program_id, v_day_2_id, 1, v_changed_at, 'done'
      )
      returning id into v_day_2_session_id;
    else
      update public.sessions
         set program_id = v_program_id,
             day_id = v_day_2_id,
             week = 1,
             performed_at = coalesce(performed_at, v_changed_at),
             status = 'done'
       where id = v_day_2_session_id
         and user_id = v_user_id;
    end if;
  end if;

  -- Point matching logs at canonical slots. Unmatched exercises stay attached
  -- to their old slot so no completed lift is lost from History.
  for v_mapped in
    with aliases(alias_key, canonical_key) as (
      values
        ('bench press', 'barbell bench press'),
        ('touch-and-go bench', 'barbell bench press'),
        ('touch and go bench', 'barbell bench press'),
        ('db incline bench', 'incline dumbbell bench press'),
        ('incline db press', 'incline dumbbell bench press'),
        ('incline dumbbell press', 'incline dumbbell bench press'),
        ('pull up', 'pull-up'),
        ('pullup', 'pull-up'),
        ('pull-up or pulldown', 'pull-up'),
        ('row', 'barbell row'),
        ('rows', 'barbell row'),
        ('barbell rows', 'barbell row'),
        ('db lateral raise', 'dumbbell lateral raise'),
        ('seated lateral raise', 'seated dumbbell lateral raise'),
        ('barbell wrist curl', 'dumbbell wrist curl'),
        ('wrist curl', 'dumbbell wrist curl'),
        ('barbell curl', 'ez-bar curl'),
        ('ez bar curl', 'ez-bar curl'),
        ('pushdown', 'triceps pushdown'),
        ('reverse curl', 'cable reverse curl'),
        ('squat', 'barbell squat'),
        ('barbell back squat', 'barbell squat'),
        ('incline curl', 'incline dumbbell curl'),
        ('incline db curl', 'incline dumbbell curl'),
        ('skullcrusher', 'skull crusher')
    ),
    candidates as (
      select
        l.session_id,
        l.slot_id as old_slot_id,
        target.id as new_slot_id,
        l.created_at
      from public.set_logs l
      join public.exercise_slots source on source.id = l.slot_id
      join public.sessions current_session on current_session.id = l.session_id
      join public.exercise_slots target on target.day_id = current_session.day_id
      left join aliases a
        on a.alias_key = regexp_replace(
          lower(trim(source.exercise_name)),
          '[[:space:]]+',
          ' ',
          'g'
        )
      where l.user_id = v_user_id
        and l.session_id in (v_day_1_session_id, v_day_2_session_id)
        and source.id <> target.id
        and coalesce(
          a.canonical_key,
          regexp_replace(
            lower(trim(source.exercise_name)),
            '[[:space:]]+',
            ' ',
            'g'
          )
        ) = regexp_replace(
          lower(trim(target.exercise_name)),
          '[[:space:]]+',
          ' ',
          'g'
        )
    )
    select distinct on (session_id, new_slot_id)
      session_id,
      old_slot_id,
      new_slot_id
    from candidates
    order by session_id, new_slot_id, created_at desc
  loop
    if not exists (
      select 1
        from public.set_logs
       where session_id = v_mapped.session_id
         and slot_id = v_mapped.new_slot_id
    ) and not exists (
      select 1
        from public.set_entries
       where session_id = v_mapped.session_id
         and slot_id = v_mapped.new_slot_id
    ) then
      update public.set_entries
         set slot_id = v_mapped.new_slot_id
       where user_id = v_user_id
         and session_id = v_mapped.session_id
         and slot_id = v_mapped.old_slot_id;

      update public.set_logs
         set slot_id = v_mapped.new_slot_id,
             week = 1
       where user_id = v_user_id
         and session_id = v_mapped.session_id
         and slot_id = v_mapped.old_slot_id;
    end if;
  end loop;

  update public.set_logs
     set week = 1
   where user_id = v_user_id
     and session_id in (v_day_1_session_id, v_day_2_session_id)
     and week <> 1;

  -- Only training blocks change. Diet blocks and all body/nutrition rows remain
  -- byte-for-byte untouched.
  update public.blocks
     set is_active = false
   where user_id = v_user_id
     and kind = 'training'
     and is_active = true;

  select id
    into v_training_block_id
    from public.blocks
   where user_id = v_user_id
     and kind = 'training'
     and program_id = v_program_id
     and start_date = date '2026-07-29'
   order by created_at desc
   limit 1;

  if v_training_block_id is null then
    insert into public.blocks (
      user_id,
      kind,
      name,
      goal,
      phase,
      start_date,
      end_date,
      length_weeks,
      program_id,
      is_active,
      notes
    ) values (
      v_user_id,
      'training',
      'Five-Day Progression Block',
      'Progress load or reps while keeping hard-set quality high.',
      'hypertrophy',
      date '2026-07-29',
      date '2026-09-01',
      5,
      v_program_id,
      true,
      'Started July 29, 2026. Prior programs are archived; their training history still drives progression.'
    );
  else
    update public.blocks
       set name = 'Five-Day Progression Block',
           goal = 'Progress load or reps while keeping hard-set quality high.',
           phase = 'hypertrophy',
           start_date = date '2026-07-29',
           end_date = date '2026-09-01',
           length_weeks = 5,
           program_id = v_program_id,
           is_active = true
     where id = v_training_block_id
       and user_id = v_user_id
       and kind = 'training';
  end if;
end;
$$;
