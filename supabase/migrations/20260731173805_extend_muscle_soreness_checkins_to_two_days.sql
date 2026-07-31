-- Extend the existing next-day soreness flow to calendar days 1 and 2. A
-- muscle can be checked once on each day, while the user-level expression
-- index prevents duplicate answers when more than one eligible session trained
-- the same muscle.
alter table public.muscle_soreness_checkins
  drop constraint if exists muscle_soreness_checkins_session_id_muscle_area_key;

alter table public.muscle_soreness_checkins
  add constraint muscle_soreness_checkins_session_muscle_day_key
  unique (session_id, muscle_area, checked_on);

-- The original constraint was per session, so two sessions could produce two
-- rows for the same muscle/day. Collapse any such history before installing
-- the user-level guarantee. Keep the latest source session and the worst rating
-- so no recovery warning is lost.
with ranked as (
  select
    checkin.id,
    row_number() over (
      partition by
        checkin.user_id,
        lower(regexp_replace(
          btrim(checkin.muscle_area),
          '[[:space:]]+',
          ' ',
          'g'
        )),
        checkin.checked_on
      order by source_session.performed_at desc nulls last, checkin.updated_at desc, checkin.id
    ) as duplicate_rank,
    max(checkin.soreness) over (
      partition by
        checkin.user_id,
        lower(regexp_replace(
          btrim(checkin.muscle_area),
          '[[:space:]]+',
          ' ',
          'g'
        )),
        checkin.checked_on
    ) as max_soreness
  from public.muscle_soreness_checkins checkin
  join public.sessions source_session on source_session.id = checkin.session_id
)
update public.muscle_soreness_checkins checkin
   set soreness = ranked.max_soreness,
       updated_at = now()
  from ranked
 where ranked.id = checkin.id
   and ranked.duplicate_rank = 1
   and checkin.soreness is distinct from ranked.max_soreness;

with ranked as (
  select
    checkin.id,
    row_number() over (
      partition by
        checkin.user_id,
        lower(regexp_replace(
          btrim(checkin.muscle_area),
          '[[:space:]]+',
          ' ',
          'g'
        )),
        checkin.checked_on
      order by source_session.performed_at desc nulls last, checkin.updated_at desc, checkin.id
    ) as duplicate_rank
  from public.muscle_soreness_checkins checkin
  join public.sessions source_session on source_session.id = checkin.session_id
)
delete from public.muscle_soreness_checkins checkin
using ranked
where ranked.id = checkin.id
  and ranked.duplicate_rank > 1;

create unique index if not exists muscle_soreness_checkins_user_muscle_day_key
  on public.muscle_soreness_checkins (
    user_id,
    lower(regexp_replace(btrim(muscle_area), '[[:space:]]+', ' ', 'g')),
    checked_on
  );
