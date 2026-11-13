-- Did a meeting happen? (13 Nov 2026, D-059) Google Calendar cannot say whether anyone joined, so
-- a meeting that ended counts as held until its owner marks it missed. Every member reads every
-- member's marks (calendars are shared, view only, D-054); only the owner writes their own, and
-- only for a timed meeting of their calendar that has ended. A missed meeting's logged entry
-- stays in history, reads as missed, and is not a touch: last touch skips it.

create table public.calendar_meeting_outcomes (
  member_id uuid not null references public.members (id) on delete cascade,
  google_event_id text not null check (length(google_event_id) > 0),
  outcome text not null check (outcome in ('held', 'missed')),
  primary key (member_id, google_event_id)
);
alter table public.calendar_meeting_outcomes enable row level security;
revoke all on public.calendar_meeting_outcomes from anon;

-- A meeting the member can mark: in their calendar, timed, ended, not declined or cancelled, and
-- not one of the CRM's own next-action events (those are follow-ups, missed on their own).
create or replace function public.ua_markable_meeting(p_member uuid, p_event_id text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.calendar_events e
    where e.member_id = p_member
      and e.google_event_id = p_event_id
      and not e.all_day
      and e.status <> 'cancelled'
      and coalesce(e.self_response, '') <> 'declined'
      and e.ua_row_id is null
      and e.end_at <= now()
  )
$$;

create policy calendar_meeting_outcomes_select_members on public.calendar_meeting_outcomes
  for select to authenticated
  using ((select public.current_member_id()) is not null);
create policy calendar_meeting_outcomes_insert_own on public.calendar_meeting_outcomes
  for insert to authenticated
  with check (
    member_id = (select public.current_member_id())
    and public.ua_markable_meeting(member_id, google_event_id)
  );
create policy calendar_meeting_outcomes_update_own on public.calendar_meeting_outcomes
  for update to authenticated
  using (member_id = (select public.current_member_id()))
  with check (
    member_id = (select public.current_member_id())
    and public.ua_markable_meeting(member_id, google_event_id)
  );
create policy calendar_meeting_outcomes_delete_own on public.calendar_meeting_outcomes
  for delete to authenticated
  using (member_id = (select public.current_member_id()));

alter publication supabase_realtime add table public.calendar_meeting_outcomes;

-- ---------- Last touch skips a missed meeting ----------

create or replace function public.ua_last_touch_of(p_row uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select max(h.at) from public.history h
  where h.row_id = p_row
    and not (
      h.source = 'calendar'
      and h.source_event_key is not null
      and exists (
        select 1 from public.calendar_meeting_outcomes o
        where o.member_id = h.owner_id
          and o.google_event_id = h.source_event_key
          and o.outcome = 'missed'
      )
    )
$$;

create or replace function public.ua_refresh_last_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := coalesce(new.row_id, old.row_id);
begin
  update public.rows r
  set last_touch_at = public.ua_last_touch_of(target)
  where r.id = target;
  if tg_op = 'UPDATE' and old.row_id is distinct from new.row_id then
    update public.rows r
    set last_touch_at = public.ua_last_touch_of(old.row_id)
    where r.id = old.row_id;
  end if;
  return null;
end
$$;

-- A mark changes the last touch of every row the meeting was logged into.
create or replace function public.ua_outcome_refresh_last_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid := coalesce(new.member_id, old.member_id);
  v_event text := coalesce(new.google_event_id, old.google_event_id);
begin
  update public.rows r
  set last_touch_at = public.ua_last_touch_of(r.id)
  where r.id in (
    select h.row_id from public.history h
    where h.source = 'calendar' and h.owner_id = v_member and h.source_event_key = v_event
  );
  return null;
end
$$;

create trigger calendar_meeting_outcomes_last_touch
  after insert or update or delete on public.calendar_meeting_outcomes
  for each row execute function public.ua_outcome_refresh_last_touch();

-- ---------- History reads: a logged meeting carries its event and whether it was missed ----------

create or replace function public.ua_history_json(h public.history)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', h.id,
    'rowId', h.row_id,
    'kind', h.kind,
    'source', h.source,
    'at', public.ua_iso(h.at),
    'fuzzyDate', case when h.fuzzy_date is null then null
      else jsonb_build_object('date', h.fuzzy_date, 'precision', h.fuzzy_precision) end,
    'text', h.text,
    'memberId', h.member_id
  ) || case
    when h.source = 'calendar' and h.source_event_key is not null then jsonb_build_object(
      'meta', coalesce(h.meta, '{}'::jsonb) || jsonb_build_object(
        'calendarEventId', h.source_event_key,
        'missed', exists (
          select 1 from public.calendar_meeting_outcomes o
          where o.member_id = h.owner_id
            and o.google_event_id = h.source_event_key
            and o.outcome = 'missed'
        )
      )
    )
    when h.meta is null then '{}'::jsonb
    else jsonb_build_object('meta', h.meta)
  end
$$;

revoke execute on function public.ua_markable_meeting(uuid, text) from public, anon;
grant execute on function public.ua_markable_meeting(uuid, text) to authenticated, service_role;
revoke execute on function public.ua_last_touch_of(uuid) from public, anon, authenticated;
revoke execute on function public.ua_outcome_refresh_last_touch() from public, anon, authenticated;
