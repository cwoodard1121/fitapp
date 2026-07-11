-- Install Cameron's July 11, 2026 training block without deleting history.
-- Existing programs and their sessions remain intact; the fresh program becomes
-- active and all training/diet blocks are re-anchored to the requested date.

do $$
declare
  v_user_id uuid;
  v_program_id uuid;
  v_day_id uuid;
begin
  select id
    into v_user_id
    from auth.users
   where lower(email) = lower('cameronwoodard1121@gmail.com')
   order by created_at
   limit 1;

  -- Preview/local databases intentionally do not contain production auth data.
  if v_user_id is null then
    raise notice 'FitApp user not present; skipping July 11 program data reset.';
    return;
  end if;

  -- Make the migration safe to replay without creating another copy.
  select p.id
    into v_program_id
    from public.programs p
   where p.user_id = v_user_id
     and p.name = 'Fat Loss + Muscle Regain'
     and p.start_date = date '2026-07-11'
     and exists (
       select 1
         from public.program_days d
        where d.program_id = p.id
          and d.label = 'Day 1 Chest / Back'
     )
   order by p.created_at desc
   limit 1;

  if v_program_id is null then
    update public.programs
       set is_active = false
     where user_id = v_user_id
       and is_active = true;

    insert into public.programs (
      user_id,
      name,
      length_weeks,
      deload_week,
      is_active,
      start_date
    ) values (
      v_user_id,
      'Fat Loss + Muscle Regain',
      5,
      5,
      true,
      date '2026-07-11'
    )
    returning id into v_program_id;

    insert into public.program_days (program_id, user_id, day_number, label)
    values (v_program_id, v_user_id, 1, 'Day 1 Chest / Back')
    returning id into v_day_id;

    insert into public.exercise_slots (
      day_id, user_id, slot_code, order_index, exercise_name, muscle_area,
      progress_bias, rep_low, rep_high, target_rir, base_sets,
      load_increment, seed_load, is_bodyweight
    ) values
      (v_day_id, v_user_id, 'D1A1', 0, 'DB incline bench', 'Upper chest', 'Reps first', 8, 15, 3, 2, 5, 75, false),
      (v_day_id, v_user_id, 'D1A2', 1, 'Pull-up', 'Back', 'Reps first', 6, 10, 3, 2, 5, null, true),
      (v_day_id, v_user_id, 'D1A3', 2, 'Row', 'Back', 'Reps first', 10, 15, 3, 2, 5, 145, false),
      (v_day_id, v_user_id, 'D1A4', 3, 'Touch-and-go bench', 'Chest', 'Load +5', 5, 8, 3, 1, 5, null, false),
      (v_day_id, v_user_id, 'D1A5', 4, 'Cable lateral raise', 'Side delts', 'Reps first', 12, 20, 3, 3, 2.5, 15, false),
      (v_day_id, v_user_id, 'D1A6', 5, 'Rear-delt fly', 'Rear delts', 'Reps first', 12, 20, 3, 3, 2.5, null, false);

    insert into public.program_days (program_id, user_id, day_number, label)
    values (v_program_id, v_user_id, 2, 'Day 2 Shoulders / Arms')
    returning id into v_day_id;

    insert into public.exercise_slots (
      day_id, user_id, slot_code, order_index, exercise_name, muscle_area,
      progress_bias, rep_low, rep_high, target_rir, base_sets,
      load_increment, seed_load, is_bodyweight
    ) values
      (v_day_id, v_user_id, 'D2A1', 0, 'Cable lateral raise', 'Side delts', 'Reps first', 15, 25, 3, 3, 2.5, 15, false),
      (v_day_id, v_user_id, 'D2A2', 1, 'Seated lateral raise', 'Side delts', 'Reps first', 6, 15, 3, 2, 2.5, null, false),
      (v_day_id, v_user_id, 'D2A3', 2, 'Barbell curl', 'Biceps', 'Reps first', 6, 12, 3, 2, 2.5, null, false),
      (v_day_id, v_user_id, 'D2A4', 3, 'Incline curl', 'Biceps', 'Reps first', 8, 15, 3, 3, 2.5, 30, false),
      (v_day_id, v_user_id, 'D2A5', 4, 'Pushdown', 'Triceps', 'Reps first', 10, 15, 3, 3, 2.5, 65, false),
      (v_day_id, v_user_id, 'D2A6', 5, 'Overhead cable triceps extension', 'Triceps', 'Reps first', 8, 15, 3, 2, 2.5, null, false),
      (v_day_id, v_user_id, 'D2A7', 6, 'Reverse curl', 'Biceps/forearms', 'Reps first', 10, 15, 3, 3, 2.5, null, false);

    insert into public.program_days (program_id, user_id, day_number, label)
    values (v_program_id, v_user_id, 3, 'Day 3 Legs / Chest / Back')
    returning id into v_day_id;

    insert into public.exercise_slots (
      day_id, user_id, slot_code, order_index, exercise_name, muscle_area,
      progress_bias, rep_low, rep_high, target_rir, base_sets,
      load_increment, seed_load, is_bodyweight
    ) values
      (v_day_id, v_user_id, 'D3A1', 0, 'Squat', 'Legs', 'Load +5', 5, 5, 3, 5, 5, null, false),
      (v_day_id, v_user_id, 'D3A2', 1, 'RDL', 'Legs', 'Load +5', 5, 5, 3, 5, 5, null, false),
      (v_day_id, v_user_id, 'D3A3', 2, 'Leg curl', 'Hamstrings', 'Reps first', 10, 15, 3, 3, 2.5, null, false),
      (v_day_id, v_user_id, 'D3A4', 3, 'Pull-up or pulldown', 'Back', 'Reps first', 8, 12, 3, 2, 5, null, true),
      (v_day_id, v_user_id, 'D3A5', 4, 'Row', 'Back', 'Reps first', 8, 12, 3, 2, 5, null, false),
      (v_day_id, v_user_id, 'D3A6', 5, 'DB incline bench', 'Upper chest', 'Reps first', 8, 12, 3, 2, 5, 75, false);

    insert into public.program_days (program_id, user_id, day_number, label)
    values (v_program_id, v_user_id, 4, 'Day 4 Shoulders / Arms')
    returning id into v_day_id;

    insert into public.exercise_slots (
      day_id, user_id, slot_code, order_index, exercise_name, muscle_area,
      progress_bias, rep_low, rep_high, target_rir, base_sets,
      load_increment, seed_load, is_bodyweight
    ) values
      (v_day_id, v_user_id, 'D4A1', 0, 'Cable lateral raise', 'Side delts', 'Reps first', 15, 25, 3, 3, 2.5, 15, false),
      (v_day_id, v_user_id, 'D4A2', 1, 'Rear-delt fly', 'Rear delts', 'Reps first', 12, 20, 3, 3, 2.5, null, false),
      (v_day_id, v_user_id, 'D4A3', 2, 'Preacher curl or cable curl', 'Biceps', 'Reps first', 8, 15, 3, 3, 2.5, null, false),
      (v_day_id, v_user_id, 'D4A4', 3, 'Hammer curl', 'Biceps/forearms', 'Reps first', 8, 15, 3, 3, 2.5, null, false),
      (v_day_id, v_user_id, 'D4A5', 4, 'Close-grip bench or dip', 'Triceps/chest', 'Reps first', 6, 10, 3, 2, 5, null, false),
      (v_day_id, v_user_id, 'D4A6', 5, 'Pushdown', 'Triceps', 'Reps first', 10, 15, 3, 3, 2.5, 65, false),
      (v_day_id, v_user_id, 'D4A7', 6, 'Barbell wrist curl', 'Forearms', 'Reps first', 15, 25, 3, 3, 2.5, null, false);
  else
    update public.programs
       set is_active = false
     where user_id = v_user_id
       and id <> v_program_id
       and is_active = true;

    update public.programs
       set is_active = true
     where id = v_program_id
       and user_id = v_user_id;
  end if;

  -- Keep the legacy profile anchor aligned for older clients.
  update public.profiles
     set start_date = date '2026-07-11',
         deload_week = 5
   where id = v_user_id;

  update public.blocks
     set start_date = date '2026-07-11',
         end_date = case
           when length_weeks is not null
             then date '2026-07-11' + (length_weeks * 7 - 1)
           else end_date
         end,
         program_id = case
           when kind = 'training' then v_program_id
           else program_id
         end
   where user_id = v_user_id;
end;
$$;
