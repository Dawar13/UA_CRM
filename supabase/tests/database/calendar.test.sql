-- Google Calendar privacy and ownership at the database (Phase 2, D-050): a member's calendar is
-- theirs alone; only the server writes events, connections and secrets; calendar history goes
-- only into the connection owner's rows, once per event. Run with `supabase test db` (CI).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local timezone = 'UTC';

select plan(30);

-- ---------- Two members, a row each, and calendar data (as the service, before sign-in) ----------

insert into public.members (id, email, name, slug, position, is_admin) values
  ('00000000-0000-0000-0000-00000000000a', 'dawar@example.test', 'Dawar', 'dawar', 0, true),
  ('00000000-0000-0000-0000-00000000000b', 'dhruv@example.test', 'Dhruv', 'dhruv', 1, true);
insert into public.sheets (id, owner_id, slug, name, template) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'customers', 'Customers', 'customers'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'customers', 'Customers', 'customers');
insert into public.rows (id, sheet_id, name, email) values
  ('30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'Rohan Mehta', 'rohan@hpf.example'),
  ('30000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'Arvind Menon', 'arvind@example.test');

insert into public.calendar_connections (member_id, google_email) values
  ('00000000-0000-0000-0000-00000000000a', 'dawar@gmail.example'),
  ('00000000-0000-0000-0000-00000000000b', 'dhruv@gmail.example');
insert into public.calendar_secrets (member_id, refresh_token_ciphertext, iv, key_version) values
  ('00000000-0000-0000-0000-00000000000a', 'c2VjcmV0', 'aXY=', 1);
insert into public.oauth_states (nonce, member_id, code_verifier, expires_at) values
  ('nonce-a', '00000000-0000-0000-0000-00000000000a', 'verifier', now() + interval '10 minutes');
insert into public.calendar_events (member_id, google_event_id, status, summary, start_at, end_at) values
  ('00000000-0000-0000-0000-00000000000a', 'evt-a', 'confirmed', 'Plant walk', '2026-11-06T04:30Z', '2026-11-06T05:30Z'),
  ('00000000-0000-0000-0000-00000000000b', 'evt-b', 'confirmed', 'Diligence call', '2026-11-06T06:30Z', '2026-11-06T07:30Z');
insert into public.calendar_event_links (member_id, google_event_id, row_id, kind) values
  ('00000000-0000-0000-0000-00000000000b', 'evt-b', '30000000-0000-0000-0000-00000000000b', 'confirmed');

-- ---------- Dawar: their own calendar, nothing of Dhruv's ----------

set local role authenticated;
set local request.jwt.claims = '{"email":"dawar@example.test"}';

select is((select count(*) from public.calendar_events), 1::bigint, 'A member reads only their own events');
select is(
  (select count(*) from public.calendar_events where member_id = '00000000-0000-0000-0000-00000000000b'),
  0::bigint,
  'Another member''s events never reach them'
);
select is((select count(*) from public.calendar_connections), 1::bigint, 'A member reads only their own connection');
select is((select count(*) from public.calendar_event_links), 0::bigint, 'Another member''s links stay hidden');
select throws_like($$ select * from public.calendar_secrets $$, '%permission denied%',
  'No member can read token ciphertext');
select throws_like($$ select * from public.oauth_states $$, '%permission denied%',
  'No member can read OAuth states');
select throws_like(
  $$ insert into public.calendar_events (member_id, google_event_id, status, start_at, end_at)
     values ('00000000-0000-0000-0000-00000000000a', 'x', 'confirmed', now(), now()) $$,
  '%permission denied%',
  'Members never write events; only the server does'
);
select throws_like(
  $$ update public.calendar_connections set status = 'active' $$,
  '%permission denied%',
  'Members never change a connection; only the server does'
);

select lives_ok(
  $$ insert into public.calendar_event_links (member_id, google_event_id, row_id, kind) values
     ('00000000-0000-0000-0000-00000000000a', 'evt-a', '30000000-0000-0000-0000-00000000000a', 'confirmed') $$,
  'A member links an event to their own row'
);
select lives_ok(
  $$ insert into public.calendar_event_links (member_id, recurring_event_id, row_id, kind) values
     ('00000000-0000-0000-0000-00000000000a', 'series-1', '30000000-0000-0000-0000-00000000000a', 'dismissed') $$,
  'A member dismisses a suggestion for a whole series'
);
select throws_like(
  $$ insert into public.calendar_event_links (member_id, google_event_id, row_id, kind) values
     ('00000000-0000-0000-0000-00000000000a', 'evt-a', '30000000-0000-0000-0000-00000000000b', 'confirmed') $$,
  '%row-level security%',
  'A link can never point to another member''s row'
);
select throws_like(
  $$ insert into public.calendar_event_links (member_id, google_event_id, row_id, kind) values
     ('00000000-0000-0000-0000-00000000000b', 'evt-b', '30000000-0000-0000-0000-00000000000b', 'dismissed') $$,
  '%row-level security%',
  'A member cannot make links as someone else'
);
select throws_like(
  $$ insert into public.history (row_id, owner_id, kind, source, at, text, member_id) values
     ('30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'meeting', 'calendar', now(), 'Faked', '00000000-0000-0000-0000-00000000000a') $$,
  '%row-level security%',
  'Members cannot write calendar history themselves'
);
select lives_ok(
  $$ insert into public.history (row_id, owner_id, kind, source, at, text, member_id) values
     ('30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'call', 'manual', '2026-11-05T05:00Z', 'Called', '00000000-0000-0000-0000-00000000000a') $$,
  'Members still log their own touches'
);
select throws_like(
  $$ select public.ua_calendar_log_meeting('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', 'k', now(), 'x') $$,
  '%permission denied%',
  'Members cannot call the calendar history function'
);
select throws_like(
  $$ select public.ua_calendar_move_next_action('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', 'e', '2026-11-20', null, 'x', now()) $$,
  '%permission denied%',
  'Members cannot call the next-action function'
);

-- ---------- The server (service role) ----------

reset request.jwt.claims;
set local role service_role;

select is(
  public.ua_calendar_log_meeting('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', 'evt-a', '2026-11-06T04:30Z', 'Plant walk'),
  true,
  'The server logs a meeting into the calendar owner''s row'
);
select is(
  public.ua_calendar_log_meeting('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', 'evt-a', '2026-11-06T04:30Z', 'Plant walk'),
  false,
  'The same event is logged once per row, however often it syncs'
);
select is(
  (select count(*) from public.history where row_id = '30000000-0000-0000-0000-00000000000a' and source = 'calendar'),
  1::bigint,
  'One calendar entry for that event and row'
);
select throws_like(
  $$ select public.ua_calendar_log_meeting('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000b', 'evt-a', now(), 'x') $$,
  '%not the calendar owner%',
  'Calendar history never goes into another member''s row'
);
select is(
  (select last_touch_at from public.rows where id = '30000000-0000-0000-0000-00000000000a'),
  '2026-11-06T04:30Z'::timestamptz,
  'Last touch follows the logged meeting'
);
select is(
  (select member_id from public.history where row_id = '30000000-0000-0000-0000-00000000000a' and source = 'calendar'),
  '00000000-0000-0000-0000-00000000000a'::uuid,
  'The entry names the calendar owner'
);
select is(
  public.ua_calendar_log_meeting('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', 'evt-blank', '2026-11-07T04:30Z', '  '),
  true,
  'A meeting without a title is logged'
);
select is(
  (select text from public.history where source_event_key = 'evt-blank'),
  'Meeting',
  'and reads "Meeting"'
);

update public.rows
set next_text = 'Send ROI note', next_date = '2026-11-13', next_precision = 'day',
  next_action_event_id = 'na-1', next_action_event_time = '16:00', next_action_event_state = 'linked'
where id = '30000000-0000-0000-0000-00000000000a';

select is(
  public.ua_calendar_move_next_action('00000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-00000000000a', 'na-1', '2026-11-20', '09:00', 'Moved', now()),
  false,
  'A move applies only to the calendar owner''s row'
);
select is(
  public.ua_calendar_move_next_action('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', 'na-1', '2026-11-20', '09:00', 'Next action moved in Google Calendar to Fri 20 Nov', '2026-11-08T05:00Z'),
  true,
  'A move in Google moves the next action'
);
select is(
  (select next_date::text || ' ' || next_action_event_time from public.rows where id = '30000000-0000-0000-0000-00000000000a'),
  '2026-11-20 09:00',
  'to the new day and time'
);
select is(
  public.ua_calendar_mark_removed('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', 'na-1'),
  true,
  'A deletion in Google marks the next action'
);
select is(
  (select public.ua_row_json(r) -> 'nextActionEvent' ->> 'state' from public.rows r where r.id = '30000000-0000-0000-0000-00000000000a'),
  'removed_in_google',
  'and the app reads the state with the row'
);

reset role;
select is(
  (select count(*) from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public'
     and tablename in ('calendar_connections', 'calendar_events', 'calendar_event_links')),
  3::bigint,
  'Calendar changes are published to Realtime, which delivers them only under the owner-only policies'
);

select * from finish();
rollback;
