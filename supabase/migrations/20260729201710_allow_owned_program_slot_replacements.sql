-- The general Program editor opens newly created programs before activation.
-- Keep the history-preserving replacement primitive available for any owned,
-- non-archived program; coach tools still resolve slots from the active program.

alter table public.exercise_slots
  add column if not exists lineage_slot_id uuid
    references public.exercise_slots (id) on delete set null;

create index if not exists idx_exercise_slots_lineage
  on public.exercise_slots (lineage_slot_id);

create or replace function public.replace_active_program_slot(
  p_slot_id uuid,
  p_exercise_name text,
  p_muscle_area text,
  p_progress_bias text,
  p_rep_low int,
  p_rep_high int,
  p_target_rir numeric,
  p_base_sets int,
  p_load_increment numeric,
  p_seed_load numeric,
  p_is_bodyweight boolean
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_slot public.exercise_slots%rowtype;
  v_new_slot_id uuid;
begin
  if p_exercise_name is null
     or char_length(btrim(p_exercise_name)) not between 1 and 80 then
    raise exception 'Exercise name must contain 1 to 80 characters.';
  end if;
  if p_muscle_area is not null
     and char_length(btrim(p_muscle_area)) not between 1 and 40 then
    raise exception 'Muscle area must contain 1 to 40 characters.';
  end if;
  if p_progress_bias is null
     or p_progress_bias not in ('Load +5', 'Reps first', 'Set optional') then
    raise exception 'Unknown progression bias.';
  end if;
  if p_rep_low is null
     or p_rep_high is null
     or p_rep_low < 1
     or p_rep_high < p_rep_low
     or p_rep_high > 100 then
    raise exception 'Invalid rep range.';
  end if;
  if p_target_rir is null or p_target_rir < 0 or p_target_rir > 10 then
    raise exception 'Invalid target RIR.';
  end if;
  if p_base_sets is null or p_base_sets < 1 or p_base_sets > 20 then
    raise exception 'Invalid set count.';
  end if;
  if p_load_increment is null
     or p_load_increment <= 0
     or p_load_increment > 100 then
    raise exception 'Invalid load increment.';
  end if;
  if p_seed_load is not null and (p_seed_load < 0 or p_seed_load > 2000) then
    raise exception 'Invalid seed load.';
  end if;
  if p_is_bodyweight is null then
    raise exception 'Bodyweight flag is required.';
  end if;

  select slot.*
    into v_slot
    from public.exercise_slots slot
    join public.program_days day
      on day.id = slot.day_id
     and day.user_id = slot.user_id
    join public.programs program
      on program.id = day.program_id
     and program.user_id = slot.user_id
   where slot.id = p_slot_id
     and slot.user_id = (select auth.uid())
     and slot.order_index >= 0
     and program.archived_at is null
   for update of slot;

  if not found then
    raise exception 'Program exercise was not found.';
  end if;

  update public.exercise_slots
     set order_index = -1000000 - abs(v_slot.order_index)
   where id = v_slot.id
     and user_id = (select auth.uid());

  insert into public.exercise_slots (
    day_id,
    user_id,
    lineage_slot_id,
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
  )
  values (
    v_slot.day_id,
    v_slot.user_id,
    coalesce(v_slot.lineage_slot_id, v_slot.id),
    v_slot.slot_code,
    v_slot.order_index,
    btrim(p_exercise_name),
    case when p_muscle_area is null then null else btrim(p_muscle_area) end,
    p_progress_bias,
    p_rep_low,
    p_rep_high,
    p_target_rir,
    p_base_sets,
    p_load_increment,
    p_seed_load,
    p_is_bodyweight
  )
  returning id into v_new_slot_id;

  return v_new_slot_id;
end;
$$;

revoke all on function public.replace_active_program_slot(
  uuid, text, text, text, int, int, numeric, int, numeric, numeric, boolean
) from public;
revoke all on function public.replace_active_program_slot(
  uuid, text, text, text, int, int, numeric, int, numeric, numeric, boolean
) from anon;
grant execute on function public.replace_active_program_slot(
  uuid, text, text, text, int, int, numeric, int, numeric, numeric, boolean
) to authenticated;
