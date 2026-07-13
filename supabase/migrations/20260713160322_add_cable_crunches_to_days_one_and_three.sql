-- Add three sets of cable crunches to the end of Days 1 and 3 in Cameron's
-- active program. The seed program mirrors these slots for future resets.

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
    raise notice 'FitApp user not present; skipping cable crunch addition.';
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
    raise notice 'Active Fat Loss + Muscle Regain program not present; skipping cable crunch addition.';
    return;
  end if;

  select id
    into v_day_id
    from public.program_days
   where program_id = v_program_id
     and user_id = v_user_id
     and day_number = 1
   limit 1;

  if v_day_id is not null then
    if not exists (
      select 1
        from public.exercise_slots
       where day_id = v_day_id
         and user_id = v_user_id
         and exercise_name = 'Cable crunch'
         and order_index >= 0
    ) then
      insert into public.exercise_slots (
        day_id, user_id, slot_code, order_index, exercise_name, muscle_area,
        progress_bias, rep_low, rep_high, target_rir, base_sets,
        load_increment, seed_load, is_bodyweight
      ) values (
        v_day_id, v_user_id, 'D1A8', 4, 'Cable crunch', 'Abs',
        'Reps first', 12, 20, 3, 3, 5, null, false
      );
    end if;

    update public.exercise_slots
       set base_sets = 3
     where day_id = v_day_id
       and user_id = v_user_id
       and exercise_name = 'Cable crunch'
       and order_index >= 0;
  end if;

  select id
    into v_day_id
    from public.program_days
   where program_id = v_program_id
     and user_id = v_user_id
     and day_number = 3
   limit 1;

  if v_day_id is not null then
    if not exists (
      select 1
        from public.exercise_slots
       where day_id = v_day_id
         and user_id = v_user_id
         and exercise_name = 'Cable crunch'
         and order_index >= 0
    ) then
      insert into public.exercise_slots (
        day_id, user_id, slot_code, order_index, exercise_name, muscle_area,
        progress_bias, rep_low, rep_high, target_rir, base_sets,
        load_increment, seed_load, is_bodyweight
      ) values (
        v_day_id, v_user_id, 'D3A8', 5, 'Cable crunch', 'Abs',
        'Reps first', 12, 20, 3, 3, 5, null, false
      );
    end if;

    update public.exercise_slots
       set base_sets = 3
     where day_id = v_day_id
       and user_id = v_user_id
       and exercise_name = 'Cable crunch'
       and order_index >= 0;
  end if;
end;
$$;
