-- Restart Cameron's active FitApp blocks on August 26, 2026 while preserving
-- the Day 1 workout completed on August 25 as Week 1 of the new schedule.
--
-- Updating programs.start_date rotates schedule_version by trigger. Re-homing
-- yesterday's session onto that new version is therefore required for the
-- workout to remain visible in the current week.

do $$
declare
  v_user_id uuid;
  v_program_id uuid;
  v_day_one_session_id uuid;
  v_schedule_version uuid;
  v_start_date constant date := date '2026-08-26';
  v_day_one_date constant date := date '2026-08-25';
begin
  select id
    into v_user_id
    from auth.users
   where lower(email) = lower('cameronwoodard1121@gmail.com')
   order by created_at
   limit 1;

  -- Preview/local databases intentionally do not contain production auth data.
  if v_user_id is null then
    raise notice 'FitApp user not present; skipping August 26 block restart.';
    return;
  end if;

  select p.id
    into v_program_id
    from public.programs p
   where p.user_id = v_user_id
     and p.is_active = true
   order by p.created_at desc
   limit 1;

  if v_program_id is null then
    raise exception 'FitApp active program not present; cannot restart Week 1.';
  end if;

  -- Capture yesterday's completed Day 1 before the program timing update
  -- rotates its schedule version.
  select s.id
    into v_day_one_session_id
    from public.sessions s
    join public.program_days d on d.id = s.day_id
   where s.user_id = v_user_id
     and s.program_id = v_program_id
     and d.user_id = v_user_id
     and d.day_number = 1
     and (
       coalesce(s.performed_at, s.created_at)
         at time zone 'America/Toronto'
     )::date = v_day_one_date
     and (
       s.status in ('done', 'in_progress')
       or exists (
         select 1
           from public.set_logs l
          where l.user_id = v_user_id
            and l.session_id = s.id
       )
       or exists (
         select 1
           from public.set_entries e
          where e.user_id = v_user_id
            and e.session_id = s.id
       )
     )
   order by
     case s.status
       when 'done' then 0
       when 'in_progress' then 1
       else 2
     end,
     coalesce(s.performed_at, s.created_at) desc
   limit 1;

  if v_day_one_session_id is null then
    raise exception 'August 25 Day 1 workout not found; refusing to restart without preserving it.';
  end if;

  -- This rotates schedule_version through the existing timing-change trigger,
  -- which makes today Week 1 / Mesocycle 0 in the app.
  update public.programs
     set start_date = v_start_date
   where id = v_program_id
     and user_id = v_user_id;

  select schedule_version
    into v_schedule_version
    from public.programs
   where id = v_program_id
     and user_id = v_user_id;

  if v_schedule_version is null then
    raise exception 'FitApp schedule version was not generated.';
  end if;

  update public.sessions
     set schedule_version = v_schedule_version,
         mesocycle = 0,
         week = 1
   where id = v_day_one_session_id
     and user_id = v_user_id;

  update public.set_logs
     set week = 1
   where user_id = v_user_id
     and session_id = v_day_one_session_id
     and week <> 1;

  -- Keep the legacy profile anchor aligned for older clients.
  update public.profiles
     set start_date = v_start_date
   where id = v_user_id;

  -- Restart only current blocks. Completed/history blocks remain untouched.
  update public.blocks
     set start_date = v_start_date,
         end_date = case
           when length_weeks is not null
             then v_start_date + (length_weeks * 7 - 1)
           else end_date
         end
   where user_id = v_user_id
     and is_active = true
     and completed_at is null;

  if exists (
    select 1
      from public.blocks
     where user_id = v_user_id
       and is_active = true
       and completed_at is null
       and start_date is distinct from v_start_date
  ) then
    raise exception 'One or more active FitApp blocks did not restart on August 26.';
  end if;

  if not exists (
    select 1
      from public.sessions
     where id = v_day_one_session_id
       and user_id = v_user_id
       and program_id = v_program_id
       and schedule_version = v_schedule_version
       and mesocycle = 0
       and week = 1
  ) then
    raise exception 'August 25 Day 1 workout was not preserved in Week 1.';
  end if;
end;
$$;
