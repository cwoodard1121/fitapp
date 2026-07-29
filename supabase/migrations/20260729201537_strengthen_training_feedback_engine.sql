-- ============================================================================
-- Atomic training-set persistence and immutable-at-save target context
-- ============================================================================

alter table public.set_logs
  add column if not exists target_load numeric,
  add column if not exists target_sets int,
  add column if not exists target_reps int,
  add column if not exists target_rir numeric,
  add column if not exists pain int;

alter table public.set_logs
  drop constraint if exists set_logs_pain_check,
  drop constraint if exists set_logs_target_load_check,
  drop constraint if exists set_logs_target_sets_check,
  drop constraint if exists set_logs_target_reps_check,
  drop constraint if exists set_logs_target_rir_check;

alter table public.set_logs
  add constraint set_logs_pain_check
    check (pain is null or pain between 0 and 10),
  add constraint set_logs_target_load_check
    check (target_load is null or target_load between 0 and 2000),
  add constraint set_logs_target_sets_check
    check (target_sets is null or target_sets between 1 and 30),
  add constraint set_logs_target_reps_check
    check (target_reps is null or target_reps between 1 and 100),
  add constraint set_logs_target_rir_check
    check (target_rir is null or target_rir between 0 and 10);

create or replace function public.save_training_set_entries_atomic(
  p_session_id uuid,
  p_slot_id uuid,
  p_week int,
  p_entries jsonb,
  p_target_load numeric,
  p_target_sets int,
  p_target_reps int,
  p_target_rir numeric
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session_week int;
  v_entry jsonb;
  v_load numeric;
  v_reps_number numeric;
  v_reps int;
  v_rir numeric;
  v_set_number int := 0;
  v_performed_count int := 0;
  v_actual_sets int;
  v_best_load numeric;
  v_best_reps int;
  v_worst_rir numeric;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if p_session_id is null or p_slot_id is null then
    raise exception 'Session and exercise are required.';
  end if;
  if p_week is null or p_week < 1 then
    raise exception 'Invalid training week.';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'Set entries must be a JSON array.';
  end if;
  if jsonb_array_length(p_entries) > 30 then
    raise exception 'No more than 30 sets may be saved at once.';
  end if;

  if p_target_load is not null
     and (p_target_load < 0 or p_target_load > 2000) then
    raise exception 'Invalid target load.';
  end if;
  if p_target_sets is not null
     and (p_target_sets < 1 or p_target_sets > 30) then
    raise exception 'Invalid target set count.';
  end if;
  if p_target_reps is not null
     and (p_target_reps < 1 or p_target_reps > 100) then
    raise exception 'Invalid target rep count.';
  end if;
  if p_target_rir is not null
     and (p_target_rir < 0 or p_target_rir > 10) then
    raise exception 'Invalid target RIR.';
  end if;

  -- Locking the owned session serializes concurrent autosaves. Joining the slot
  -- proves that it belongs to this exact session day and to the same user.
  select s.week
    into v_session_week
    from public.sessions s
    join public.exercise_slots es
      on es.id = p_slot_id
     and es.day_id = s.day_id
     and es.user_id = s.user_id
   where s.id = p_session_id
     and s.user_id = v_user_id
   for update of s, es;

  if not found then
    raise exception 'Training session exercise was not found.';
  end if;
  if p_week <> v_session_week then
    raise exception 'Training week does not match the session.';
  end if;

  -- Validate every item before changing either persistence table. A row is
  -- performed only once reps are present; load-only rows are UI prefills.
  for v_entry in
    select item
      from jsonb_array_elements(p_entries)
        with ordinality as supplied(item, ordinal)
     order by ordinal
  loop
    if jsonb_typeof(v_entry) <> 'object' then
      raise exception 'Each set entry must be a JSON object.';
    end if;
    if exists (
      select 1
        from jsonb_object_keys(v_entry) as supplied_keys(key_name)
       where key_name not in ('load', 'reps', 'rir')
    ) then
      raise exception 'Set entries contain an unknown field.';
    end if;
    if (v_entry ? 'load')
       and jsonb_typeof(v_entry -> 'load') not in ('number', 'null') then
      raise exception 'Set load must be numeric or null.';
    end if;
    if (v_entry ? 'reps')
       and jsonb_typeof(v_entry -> 'reps') not in ('number', 'null') then
      raise exception 'Set reps must be numeric or null.';
    end if;
    if (v_entry ? 'rir')
       and jsonb_typeof(v_entry -> 'rir') not in ('number', 'null') then
      raise exception 'Set RIR must be numeric or null.';
    end if;

    v_load := case
      when jsonb_typeof(v_entry -> 'load') = 'number'
        then (v_entry ->> 'load')::numeric
      else null
    end;
    v_reps_number := case
      when jsonb_typeof(v_entry -> 'reps') = 'number'
        then (v_entry ->> 'reps')::numeric
      else null
    end;
    v_rir := case
      when jsonb_typeof(v_entry -> 'rir') = 'number'
        then (v_entry ->> 'rir')::numeric
      else null
    end;

    if v_load is not null and (v_load < 0 or v_load > 2000) then
      raise exception 'Set load is outside the allowed range.';
    end if;
    if v_reps_number is not null
       and (
         v_reps_number <> trunc(v_reps_number)
         or v_reps_number < 1
         or v_reps_number > 100
       ) then
      raise exception 'Set reps are outside the allowed range.';
    end if;
    if v_rir is not null and (v_rir < 0 or v_rir > 10) then
      raise exception 'Set RIR is outside the allowed range.';
    end if;
  end loop;

  delete from public.set_entries
   where user_id = v_user_id
     and session_id = p_session_id
     and slot_id = p_slot_id;

  for v_entry in
    select item
      from jsonb_array_elements(p_entries)
        with ordinality as supplied(item, ordinal)
     order by ordinal
  loop
    v_load := case
      when jsonb_typeof(v_entry -> 'load') = 'number'
        then (v_entry ->> 'load')::numeric
      else null
    end;
    v_reps_number := case
      when jsonb_typeof(v_entry -> 'reps') = 'number'
        then (v_entry ->> 'reps')::numeric
      else null
    end;
    v_rir := case
      when jsonb_typeof(v_entry -> 'rir') = 'number'
        then (v_entry ->> 'rir')::numeric
      else null
    end;

    if v_reps_number is not null then
      v_reps := v_reps_number::int;
      v_set_number := v_set_number + 1;
      v_performed_count := v_performed_count + 1;

      insert into public.set_entries (
        user_id,
        session_id,
        slot_id,
        set_number,
        load,
        reps,
        rir
      )
      values (
        v_user_id,
        p_session_id,
        p_slot_id,
        v_set_number,
        v_load,
        v_reps,
        v_rir
      );
    end if;
  end loop;

  if v_performed_count = 0 then
    v_actual_sets := null;
    v_best_load := null;
    v_best_reps := null;
    v_worst_rir := null;
  else
    v_actual_sets := v_performed_count;

    -- Match aggregateFromEntries: prefer the first highest-Epley loaded set.
    select entry.load, entry.reps
      into v_best_load, v_best_reps
      from public.set_entries entry
     where entry.user_id = v_user_id
       and entry.session_id = p_session_id
       and entry.slot_id = p_slot_id
       and entry.load is not null
       and entry.reps is not null
     order by
       entry.load * (1 + entry.reps / 30.0) desc,
       entry.set_number asc
     limit 1;

    -- If every performed set is loadless, fall back to the first most-repped
    -- set, exactly like the application's aggregate helper.
    if not found then
      select entry.load, entry.reps
        into v_best_load, v_best_reps
        from public.set_entries entry
       where entry.user_id = v_user_id
         and entry.session_id = p_session_id
         and entry.slot_id = p_slot_id
       order by entry.reps desc nulls last, entry.set_number asc
       limit 1;
    end if;

    -- Conservative exertion signal: any hard performed set counts.
    select min(entry.rir)
      into v_worst_rir
      from public.set_entries entry
     where entry.user_id = v_user_id
       and entry.session_id = p_session_id
       and entry.slot_id = p_slot_id;
  end if;

  insert into public.set_logs (
    user_id,
    session_id,
    slot_id,
    week,
    actual_load,
    best_reps,
    actual_sets,
    actual_rir,
    target_load,
    target_sets,
    target_reps,
    target_rir
  )
  values (
    v_user_id,
    p_session_id,
    p_slot_id,
    p_week,
    v_best_load,
    v_best_reps,
    v_actual_sets,
    v_worst_rir,
    p_target_load,
    p_target_sets,
    p_target_reps,
    p_target_rir
  )
  on conflict (session_id, slot_id) do update
     set week = excluded.week,
         actual_load = excluded.actual_load,
         best_reps = excluded.best_reps,
         actual_sets = excluded.actual_sets,
         actual_rir = excluded.actual_rir,
         target_load = excluded.target_load,
         target_sets = excluded.target_sets,
         target_reps = excluded.target_reps,
         target_rir = excluded.target_rir;
end;
$$;

revoke all on function public.save_training_set_entries_atomic(
  uuid, uuid, int, jsonb, numeric, int, int, numeric
) from public;
revoke all on function public.save_training_set_entries_atomic(
  uuid, uuid, int, jsonb, numeric, int, int, numeric
) from anon;
grant execute on function public.save_training_set_entries_atomic(
  uuid, uuid, int, jsonb, numeric, int, int, numeric
) to authenticated;

-- Session-wide recovery is fanned to active slots plus already-logged retired
-- slots on the owned session's actual day. A mid-session program edit therefore
-- cannot detach recovery from work already entered, and the client still cannot
-- attach recovery to unrelated user-owned rows.
create or replace function public.save_training_session_readiness(
  p_session_id uuid,
  p_week int,
  p_recovery int
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session_week int;
  v_day_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;
  if p_week is null or p_week < 1 then
    raise exception 'Invalid training week.';
  end if;
  if p_recovery is not null and p_recovery not between 1 and 10 then
    raise exception 'Invalid recovery rating.';
  end if;

  select s.week, s.day_id
    into v_session_week, v_day_id
    from public.sessions s
   where s.id = p_session_id
     and s.user_id = v_user_id
   for update;

  if not found then
    raise exception 'Training session was not found.';
  end if;
  if p_week <> v_session_week then
    raise exception 'Training week does not match the session.';
  end if;

  insert into public.set_logs (
    user_id,
    session_id,
    slot_id,
    week,
    recovery
  )
  select
    v_user_id,
    p_session_id,
    slot.id,
    p_week,
    p_recovery
  from public.exercise_slots slot
  where slot.user_id = v_user_id
    and slot.day_id = v_day_id
    and (
      slot.order_index >= 0
      or exists (
        select 1
          from public.set_logs existing_log
         where existing_log.user_id = v_user_id
           and existing_log.session_id = p_session_id
           and existing_log.slot_id = slot.id
      )
    )
  on conflict (session_id, slot_id) do update
     set week = excluded.week,
         recovery = excluded.recovery;
end;
$$;

revoke all on function public.save_training_session_readiness(
  uuid, int, int
) from public;
revoke all on function public.save_training_session_readiness(
  uuid, int, int
) from anon;
grant execute on function public.save_training_session_readiness(
  uuid, int, int
) to authenticated;

-- Exercise feedback uses the same owned session/day/slot relationship proof as
-- set persistence and snapshots the exact target visible when feedback begins.
create or replace function public.save_training_exercise_feedback(
  p_session_id uuid,
  p_slot_id uuid,
  p_week int,
  p_pump int,
  p_pain int,
  p_enjoyment int,
  p_performance text,
  p_hit_rir_override text,
  p_notes text,
  p_target_load numeric,
  p_target_sets int,
  p_target_reps int,
  p_target_rir numeric
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session_week int;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;
  if p_week is null or p_week < 1 then
    raise exception 'Invalid training week.';
  end if;
  if p_pump is not null and p_pump not between 1 and 10 then
    raise exception 'Invalid pump rating.';
  end if;
  if p_pain is not null and p_pain not between 0 and 10 then
    raise exception 'Invalid pain rating.';
  end if;
  if p_enjoyment is not null and p_enjoyment not between 1 and 10 then
    raise exception 'Invalid enjoyment rating.';
  end if;
  if p_performance is not null
     and p_performance not in ('Up', 'Same', 'Down') then
    raise exception 'Invalid performance rating.';
  end if;
  if p_hit_rir_override is not null
     and p_hit_rir_override not in ('Y', 'N', 'Skip') then
    raise exception 'Invalid RIR override.';
  end if;
  if p_notes is not null and char_length(p_notes) > 2000 then
    raise exception 'Feedback note is too long.';
  end if;
  if p_target_load is not null
     and (p_target_load < 0 or p_target_load > 2000) then
    raise exception 'Invalid target load.';
  end if;
  if p_target_sets is not null
     and (p_target_sets < 1 or p_target_sets > 30) then
    raise exception 'Invalid target set count.';
  end if;
  if p_target_reps is not null
     and (p_target_reps < 1 or p_target_reps > 100) then
    raise exception 'Invalid target rep count.';
  end if;
  if p_target_rir is not null
     and (p_target_rir < 0 or p_target_rir > 10) then
    raise exception 'Invalid target RIR.';
  end if;

  select s.week
    into v_session_week
    from public.sessions s
    join public.exercise_slots slot
      on slot.id = p_slot_id
     and slot.day_id = s.day_id
     and slot.user_id = s.user_id
   where s.id = p_session_id
     and s.user_id = v_user_id
   for update of s, slot;

  if not found then
    raise exception 'Training session exercise was not found.';
  end if;
  if p_week <> v_session_week then
    raise exception 'Training week does not match the session.';
  end if;

  insert into public.set_logs (
    user_id,
    session_id,
    slot_id,
    week,
    pump,
    pain,
    enjoyment,
    performance,
    hit_rir_override,
    notes,
    target_load,
    target_sets,
    target_reps,
    target_rir
  )
  values (
    v_user_id,
    p_session_id,
    p_slot_id,
    p_week,
    p_pump,
    p_pain,
    p_enjoyment,
    p_performance,
    p_hit_rir_override,
    p_notes,
    p_target_load,
    p_target_sets,
    p_target_reps,
    p_target_rir
  )
  on conflict (session_id, slot_id) do update
     set week = excluded.week,
         pump = excluded.pump,
         pain = excluded.pain,
         enjoyment = excluded.enjoyment,
         performance = excluded.performance,
         hit_rir_override = excluded.hit_rir_override,
         notes = excluded.notes,
         target_load = excluded.target_load,
         target_sets = excluded.target_sets,
         target_reps = excluded.target_reps,
         target_rir = excluded.target_rir;
end;
$$;

revoke all on function public.save_training_exercise_feedback(
  uuid, uuid, int, int, int, int, text, text, text,
  numeric, int, int, numeric
) from public;
revoke all on function public.save_training_exercise_feedback(
  uuid, uuid, int, int, int, int, text, text, text,
  numeric, int, int, numeric
) from anon;
grant execute on function public.save_training_exercise_feedback(
  uuid, uuid, int, int, int, int, text, text, text,
  numeric, int, int, numeric
) to authenticated;
