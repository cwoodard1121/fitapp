-- An explicit completion marker keeps lifecycle state separate from a block's
-- planned dates. Completed blocks are historical records and cannot also be
-- active.
set lock_timeout = '5s';

alter table public.blocks
  add column if not exists completed_at timestamptz;

-- Existing blocks whose explicit end date has passed were already complete in
-- practice. Normalize them so they no longer appear activatable after deploy.
update public.blocks
   set completed_at = end_date::timestamptz + interval '1 day' - interval '1 second',
       is_active = false
 where completed_at is null
   and end_date < current_date;

alter table public.blocks
  drop constraint if exists blocks_completed_not_active;

alter table public.blocks
  add constraint blocks_completed_not_active
  check (completed_at is null or is_active = false);

comment on column public.blocks.completed_at is
  'When the athlete explicitly completed the block; completed blocks cannot be active.';

reset lock_timeout;
