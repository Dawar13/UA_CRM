-- Google Calendar (Phase 2, part 1, D-050): each member's own connection, their events, the
-- links they make, meeting history written by the server, and next actions as events.
--
-- Privacy (D-050): a member's calendar is theirs alone. Every calendar table is readable only by
-- its member, and only the server (the service role) writes connections, events and secrets.
-- Refresh tokens are stored encrypted, and their table has no policies at all.

-- ---------- Connections, secrets and OAuth states ----------

create table public.calendar_connections (
  member_id uuid primary key references public.members (id) on delete cascade,
  google_email text not null,
  scopes text not null default '',
  status text not null default 'active'
    check (status in ('active', 'needs_reconnect', 'revoked', 'error')),
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_attempt_at timestamptz,
  -- Error codes only, never Google's message (it can carry personal data).
  last_error_code text,
  last_error_at timestamptz,
  -- Counts only: fetched, stored, removed, logged.
  last_result jsonb,
  sync_lock_until timestamptz,
  -- Google push notifications (D-051): the watch channel on the primary calendar.
  channel_id text,
  channel_resource_id text,
  channel_expires_at timestamptz,
  channel_token_hash text,
  updated_at timestamptz not null default now()
);
create unique index calendar_connections_channel on public.calendar_connections (channel_id)
  where channel_id is not null;
alter table public.calendar_connections enable row level security;
create policy calendar_connections_select_own on public.calendar_connections
  for select to authenticated
  using (member_id = (select public.current_member_id()));
revoke insert, update, delete on public.calendar_connections from anon, authenticated;

create table public.calendar_secrets (
  member_id uuid primary key references public.calendar_connections (member_id) on delete cascade,
  refresh_token_ciphertext text not null,
  iv text not null,
  key_version int not null check (key_version > 0),
  updated_at timestamptz not null default now()
);
-- Row-level security with no policies: only the service role can touch it.
alter table public.calendar_secrets enable row level security;
revoke all on public.calendar_secrets from anon, authenticated;

create table public.oauth_states (
  nonce text primary key,
  member_id uuid not null references public.members (id) on delete cascade,
  code_verifier text not null,
  return_path text not null default '/',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
alter table public.oauth_states enable row level security;
revoke all on public.oauth_states from anon, authenticated;

-- ---------- Events (from 5 Nov 2026, kept from 30 days back to 60 ahead) ----------

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  google_event_id text not null,
  recurring_event_id text,
  status text not null check (status in ('confirmed', 'tentative', 'cancelled')),
  summary text not null default '',
  location text not null default '',
  html_link text not null default '',
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  -- All-day events: the first day and the day after the last (Google's end is exclusive).
  start_date date,
  end_date date,
  time_zone text,
  attendees jsonb not null default '[]'::jsonb check (jsonb_typeof(attendees) = 'array'),
  self_response text check (self_response in ('accepted', 'declined', 'tentative', 'needsAction')),
  -- From the event's private extended properties: the CRM's own next-action events.
  ua_row_id uuid,
  ua_kind text,
  google_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  unique (member_id, google_event_id)
);
create index calendar_events_member_start on public.calendar_events (member_id, start_at);
alter table public.calendar_events enable row level security;
create policy calendar_events_select_own on public.calendar_events
  for select to authenticated
  using (member_id = (select public.current_member_id()));
revoke insert, update, delete on public.calendar_events from anon, authenticated;

-- ---------- Links the member makes: confirm a suggestion, or dismiss it ----------

create table public.calendar_event_links (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  -- One event, or a whole series (recurring event id).
  google_event_id text,
  recurring_event_id text,
  row_id uuid not null references public.rows (id) on delete cascade,
  kind text not null check (kind in ('confirmed', 'dismissed')),
  created_at timestamptz not null default now(),
  constraint calendar_event_links_target
    check ((google_event_id is null) <> (recurring_event_id is null))
);
create unique index calendar_event_links_key on public.calendar_event_links
  (member_id, coalesce(google_event_id, ''), coalesce(recurring_event_id, ''), row_id);
alter table public.calendar_event_links enable row level security;
create policy calendar_event_links_select_own on public.calendar_event_links
  for select to authenticated
  using (member_id = (select public.current_member_id()));
-- A link points to one of the member's own live rows.
create policy calendar_event_links_insert_own on public.calendar_event_links
  for insert to authenticated
  with check (
    member_id = (select public.current_member_id())
    and exists (
      select 1 from public.rows r
      where r.id = row_id and r.owner_id = (select public.current_member_id()) and r.deleted_at is null
    )
  );
create policy calendar_event_links_delete_own on public.calendar_event_links
  for delete to authenticated
  using (member_id = (select public.current_member_id()));
revoke update on public.calendar_event_links from anon, authenticated;

-- Changes reach only the member who owns them: Realtime applies the select policies above.
alter publication supabase_realtime add table
  public.calendar_connections, public.calendar_events, public.calendar_event_links;

-- ---------- History: meetings written by the calendar, once per event and row ----------

alter table public.history add column source_event_key text;
create unique index history_calendar_event_key on public.history (row_id, source_event_key)
  where source = 'calendar' and source_event_key is not null;

-- Members never write calendar history themselves; it comes only from ua_calendar_log_meeting.
drop policy history_insert on public.history;
create policy history_insert on public.history for insert to authenticated
  with check (owner_id = (select public.current_member_id()) and source <> 'calendar');

-- ---------- Rows: the calendar event made for the next action ----------

alter table public.rows
  add column next_action_event_id text,
  add column next_action_event_time text
    check (next_action_event_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add column next_action_event_state text
    check (next_action_event_state in ('linked', 'removed_in_google'));

-- The row JSON carries the next-action event (its previous definition plus one key).
create or replace function public.ua_row_json(r public.rows)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id,
    'sheetId', r.sheet_id,
    'memberId', r.owner_id,
    'position', r.position,
    'name', r.name,
    'company', r.company,
    'title', r.title,
    'phone', r.phone,
    'email', r.email,
    'linkedin', r.linkedin,
    'links', to_jsonb(r.links),
    'warmth', r.warmth,
    'stageIndex', r.stage_index,
    'stageDates', r.stage_dates,
    'lost', case when r.lost_stage_index is null then null
      else jsonb_build_object('stageIndex', r.lost_stage_index, 'date', r.lost_date) end,
    'tagIds', coalesce((
      select jsonb_agg(rt.tag_id order by rt.position, rt.created_at, rt.tag_id)
      from public.row_tags rt where rt.row_id = r.id
    ), '[]'::jsonb),
    'nextAction', case when r.next_text is null and r.next_date is null then null
      else jsonb_build_object(
        'text', coalesce(r.next_text, ''),
        'date', case when r.next_date is null then null
          else jsonb_build_object('date', r.next_date, 'precision', r.next_precision) end
      ) end,
    'introducedBy', (
      select public.ua_link_json(l) from public.row_links l
      where l.source_row_id = r.id and l.kind = 'introduced_by'
      order by l.position, l.id limit 1
    ),
    'connectsTo', coalesce((
      select jsonb_agg(public.ua_link_json(l) order by l.position, l.id)
      from public.row_links l where l.source_row_id = r.id and l.kind = 'connects_to'
    ), '[]'::jsonb),
    'samePerson', coalesce((
      select jsonb_agg(l.target_row_id order by l.position, l.id)
      from public.row_links l
      where l.source_row_id = r.id and l.kind = 'same_person' and l.target_row_id is not null
    ), '[]'::jsonb),
    'notes', r.notes,
    'files', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.name, 'size', f.size, 'mimeType', f.mime_type, 'url', f.storage_path
      ) order by f.created_at, f.id)
      from public.files f where f.row_id = r.id
    ), '[]'::jsonb),
    'fields', r.fields,
    'cellColours', r.cell_colours,
    'height', r.height,
    'nextActionEvent', case when r.next_action_event_id is null then null
      else jsonb_build_object(
        'id', r.next_action_event_id,
        'time', r.next_action_event_time,
        'state', coalesce(r.next_action_event_state, 'linked')
      ) end,
    'lastTouchAt', public.ua_iso(r.last_touch_at),
    'createdAt', public.ua_iso(r.created_at),
    'updatedAt', public.ua_iso(r.updated_at),
    'createdBy', coalesce(r.created_by, r.owner_id),
    'updatedBy', coalesce(r.updated_by, r.created_by, r.owner_id),
    'deletedAt', public.ua_iso(r.deleted_at)
  )
$$;

-- ---------- Server-only functions (the service role; never members) ----------

-- One meeting entry in the calendar owner's row. Refuses any other member's row; a repeat for the
-- same event and row does nothing. Returns whether an entry was written.
create or replace function public.ua_calendar_log_meeting(
  p_member uuid,
  p_row uuid,
  p_event_key text,
  p_at timestamptz,
  p_text text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  written int;
begin
  if not exists (
    select 1 from public.rows r
    where r.id = p_row and r.owner_id = p_member and r.deleted_at is null
  ) then
    raise exception 'Row % is not the calendar owner''s', p_row using errcode = 'insufficient_privilege';
  end if;
  insert into public.history (row_id, owner_id, kind, source, at, text, member_id, source_event_key)
  values (p_row, p_member, 'meeting', 'calendar', p_at,
    coalesce(nullif(trim(p_text), ''), 'Meeting'), p_member, p_event_key)
  on conflict (row_id, source_event_key) where source = 'calendar' and source_event_key is not null
  do nothing;
  get diagnostics written = row_count;
  return written > 0;
end
$$;

-- A next action whose event was moved in Google: the new day, and a system note.
create or replace function public.ua_calendar_move_next_action(
  p_member uuid,
  p_row uuid,
  p_event_id text,
  p_date date,
  p_time text,
  p_note text,
  p_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed int;
begin
  update public.rows
  set next_date = p_date,
    next_precision = 'day',
    next_action_event_time = p_time,
    next_action_event_state = 'linked'
  where id = p_row and owner_id = p_member and deleted_at is null
    and next_action_event_id = p_event_id;
  get diagnostics changed = row_count;
  if changed > 0 then
    insert into public.history (row_id, owner_id, kind, source, at, text, member_id)
    values (p_row, p_member, 'note', 'system', p_at, p_note, p_member);
  end if;
  return changed > 0;
end
$$;

-- A next action whose event was deleted in Google: kept, and marked so the app offers "Add again".
create or replace function public.ua_calendar_mark_removed(p_member uuid, p_row uuid, p_event_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed int;
begin
  update public.rows
  set next_action_event_state = 'removed_in_google'
  where id = p_row and owner_id = p_member and next_action_event_id = p_event_id
    and next_action_event_state is distinct from 'removed_in_google';
  get diagnostics changed = row_count;
  return changed > 0;
end
$$;

revoke execute on function public.ua_calendar_log_meeting(uuid, uuid, text, timestamptz, text)
  from public, anon, authenticated;
revoke execute on function public.ua_calendar_move_next_action(uuid, uuid, text, date, text, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.ua_calendar_mark_removed(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.ua_calendar_log_meeting(uuid, uuid, text, timestamptz, text) to service_role;
grant execute on function public.ua_calendar_move_next_action(uuid, uuid, text, date, text, text, timestamptz) to service_role;
grant execute on function public.ua_calendar_mark_removed(uuid, uuid, text) to service_role;
