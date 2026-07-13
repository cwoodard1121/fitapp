-- Shorten Cameron's current block while retaining the Day 1 training history.
-- Slots with a negative order_index are retired from the live routine. The app
-- omits them from the active program tree, but their set_logs and set_entries
-- remain attached for history and strength tracking.

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

  if v_user_id is null then
    raise notice 'FitApp user not present; skipping program adjustment.';
    return;
  end if;

  select id
    into v_program_id
    from public.programs
   where user_id = v_user_id
     and is_active = true
     and name = 'Fat Loss + Muscle Regain'
   order by created_at desc
   limit 1;

  if v_program_id is null then
    raise notice 'Active Fat Loss + Muscle Regain program not present; skipping adjustment.';
    return;
  end if;

  -- Day 1: two presses, pull-ups, then DB lateral raises. Retire row, cable
  -- lateral raise, and rear-delt fly without cascading away the completed log.
  select id
    into v_day_id
    from public.program_days
   where program_id = v_program_id
     and user_id = v_user_id
     and day_number = 1
   limit 1;

  if v_day_id is not null then
    update public.exercise_slots
       set order_index = case slot_code
         when 'D1A3' then -103
         when 'D1A5' then -105
         when 'D1A6' then -106
         else order_index
       end
     where day_id = v_day_id
       and user_id = v_user_id
       and slot_code in ('D1A3', 'D1A5', 'D1A6')
       and order_index >= 0;

    update public.exercise_slots
       set order_index = 0,
           base_sets = 2
     where day_id = v_day_id
       and user_id = v_user_id
       and slot_code = 'D1A4'
       and exercise_name = 'Touch-and-go bench';

    update public.exercise_slots
       set order_index = 1,
           base_sets = 2
     where day_id = v_day_id
       and user_id = v_user_id
       and slot_code = 'D1A1'
       and exercise_name = 'DB incline bench';

    update public.exercise_slots
       set order_index = 2
     where day_id = v_day_id
       and user_id = v_user_id
       and slot_code = 'D1A2'
       and exercise_name = 'Pull-up';

    if not exists (
      select 1
        from public.exercise_slots
       where day_id = v_day_id
         and user_id = v_user_id
         and exercise_name = 'DB lateral raise'
         and order_index >= 0
    ) then
      insert into public.exercise_slots (
        day_id, user_id, slot_code, order_index, exercise_name, muscle_area,
        progress_bias, rep_low, rep_high, target_rir, base_sets,
        load_increment, seed_load, is_bodyweight
      ) values (
        v_day_id, v_user_id, 'D1A7', 3, 'DB lateral raise', 'Side delts',
        'Reps first', 12, 20, 3, 3, 2.5, 15, false
      );
    end if;
  end if;

  -- Day 3: upper body first, then squat and conventional deadlift. Retire the
  -- RDL and leg-curl slots so any unexpected logs remain intact.
  select id
    into v_day_id
    from public.program_days
   where program_id = v_program_id
     and user_id = v_user_id
     and day_number = 3
   limit 1;

  if v_day_id is not null then
    update public.program_days
       set label = 'Day 3 Chest / Back / Legs'
     where id = v_day_id
       and user_id = v_user_id;

    update public.exercise_slots
       set order_index = case slot_code
         when 'D3A2' then -302
         when 'D3A3' then -303
         else order_index
       end
     where day_id = v_day_id
       and user_id = v_user_id
       and slot_code in ('D3A2', 'D3A3')
       and order_index >= 0;

    update public.exercise_slots
       set order_index = case slot_code
         when 'D3A4' then 0
         when 'D3A5' then 1
         when 'D3A6' then 2
         when 'D3A1' then 3
         else order_index
       end
     where day_id = v_day_id
       and user_id = v_user_id
       and slot_code in ('D3A1', 'D3A4', 'D3A5', 'D3A6');

    if not exists (
      select 1
        from public.exercise_slots
       where day_id = v_day_id
         and user_id = v_user_id
         and exercise_name = 'Deadlift'
         and order_index >= 0
    ) then
      insert into public.exercise_slots (
        day_id, user_id, slot_code, order_index, exercise_name, muscle_area,
        progress_bias, rep_low, rep_high, target_rir, base_sets,
        load_increment, seed_load, is_bodyweight
      ) values (
        v_day_id, v_user_id, 'D3A7', 4, 'Deadlift', 'Legs',
        'Load +5', 5, 5, 3, 5, 5, null, false
      );
    end if;
  end if;

  -- Day 4: two rear-delt-fly sets and skullcrushers in place of close-grip
  -- bench/dips. Day 2 intentionally remains unchanged.
  select id
    into v_day_id
    from public.program_days
   where program_id = v_program_id
     and user_id = v_user_id
     and day_number = 4
   limit 1;

  if v_day_id is not null then
    update public.exercise_slots
       set base_sets = 2
     where day_id = v_day_id
       and user_id = v_user_id
       and slot_code = 'D4A2'
       and exercise_name = 'Rear-delt fly';

    update public.exercise_slots
       set order_index = -405
     where day_id = v_day_id
       and user_id = v_user_id
       and slot_code = 'D4A5'
       and exercise_name = 'Close-grip bench or dip'
       and order_index >= 0;

    if not exists (
      select 1
        from public.exercise_slots
       where day_id = v_day_id
         and user_id = v_user_id
         and exercise_name = 'Skullcrusher'
         and order_index >= 0
    ) then
      insert into public.exercise_slots (
        day_id, user_id, slot_code, order_index, exercise_name, muscle_area,
        progress_bias, rep_low, rep_high, target_rir, base_sets,
        load_increment, seed_load, is_bodyweight
      ) values (
        v_day_id, v_user_id, 'D4A8', 4, 'Skullcrusher', 'Triceps',
        'Reps first', 8, 12, 3, 2, 2.5, null, false
      );
    end if;
  end if;
end;
$$;
