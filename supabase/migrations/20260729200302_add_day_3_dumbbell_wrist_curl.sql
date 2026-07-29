-- Append Dumbbell Wrist Curl to Day 3 of Cameron's current five-day block.
-- The app seed mirrors this prescription for programs created in the future.

do $$
declare
  v_user_id uuid;
  v_program_id uuid;
  v_day_id uuid;
  v_order_index int;
  v_slot_sequence int := 1;
  v_slot_code text;
begin
  select id
    into v_user_id
    from auth.users
   where lower(email) = lower('cameronwoodard1121@gmail.com')
   order by created_at
   limit 1;

  if v_user_id is null then
    raise notice 'FitApp user not present; skipping Day 3 wrist curl addition.';
    return;
  end if;

  select p.id
    into v_program_id
    from public.programs p
   where p.user_id = v_user_id
     and p.name = 'Five-Day Progression'
     and p.start_date = date '2026-07-29'
     and p.is_active = true
     and p.archived_at is null
   order by p.created_at desc
   limit 1;

  if v_program_id is null then
    raise notice 'Active Five-Day Progression block not present; skipping Day 3 wrist curl addition.';
    return;
  end if;

  select d.id
    into v_day_id
    from public.program_days d
   where d.program_id = v_program_id
     and d.user_id = v_user_id
     and d.day_number = 3
   limit 1;

  if v_day_id is null then
    raise notice 'Day 3 not present; skipping wrist curl addition.';
    return;
  end if;

  -- Serialize with live coach edits while checking and choosing identifiers.
  lock table public.exercise_slots in share row exclusive mode;

  if not exists (
    select 1
      from public.exercise_slots s
     where s.day_id = v_day_id
       and s.user_id = v_user_id
       and s.order_index >= 0
       and lower(trim(s.exercise_name)) = 'dumbbell wrist curl'
  ) then
    -- Keep generated identifiers collision-free even if a coach edit added or
    -- retired another Day 3 slot before this migration reached production.
    select coalesce(max(s.order_index), -1) + 1
      into v_order_index
      from public.exercise_slots s
     where s.day_id = v_day_id
       and s.user_id = v_user_id
       and s.order_index >= 0;

    loop
      v_slot_code := format('D3A%s', v_slot_sequence);
      exit when not exists (
        select 1
          from public.exercise_slots s
         where s.day_id = v_day_id
           and s.user_id = v_user_id
           and lower(trim(s.slot_code)) = lower(v_slot_code)
      );
      v_slot_sequence := v_slot_sequence + 1;
    end loop;

    insert into public.exercise_slots (
      day_id,
      user_id,
      slot_code,
      order_index,
      exercise_name,
      muscle_area,
      progress_bias,
      rep_low,
      rep_high,
      target_rir,
      base_sets,
      load_increment,
      seed_load,
      is_bodyweight
    ) values (
      v_day_id,
      v_user_id,
      v_slot_code,
      v_order_index,
      'Dumbbell Wrist Curl',
      'Forearms',
      'Reps first',
      10,
      15,
      2,
      3,
      2.5,
      null,
      false
    );
  end if;
end;
$$;
