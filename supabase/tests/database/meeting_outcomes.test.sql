-- Did a meeting happen? (D-059) Marks at the database: every member reads them; only the owner
-- marks a meeting of their own calendar, once it has ended; a missed meeting's logged entry reads
-- as missed and leaves last touch, and a held one counts again. Run with `supabase test db` (CI).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local timezone = 'UTC';

select plan(22);

-- ---------- Two members, a row, events and a logged meeting (as the service, before sign-in) ----------

insert into public.members (id, email, name, slug, position, is_admin) values
  ('00000000-0000-0000-0000-00000000000a', 'dawar@example.test', 'Dawar', 'dawar', 0, true),
  ('00000000-0000-0000-0000-00000000000b', 'dhruv@example.test', 'Dhruv', 'dhruv', 1, true);
insert into public.sheets (id, owner_id, slug, name, template) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'customers', 'Customers', 'customers');
insert into public.rows (id, sheet_id, name, email) values
  ('30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'Rohan Mehta', 'rohan@hpf.example');

insert into public.calendar_events (member_id, google_event_id, status, summary, start_at, end_at, all_day, ua_row_id) values
  ('00000000-0000-0000-0000-00000000000a', 'evt-past', 'confirmed', 'Call with Rohan',
    now() - interval '2 days', now() - interval '2 days' + interval '30 minutes', false, null),
  ('00000000-0000-0000-0000-00000000000a', 'evt-later', 'confirmed', 'Plant walk',
    now() + interval '1 day', now() + interval '1 day 1 hour', false, null),
  ('00000000-0000-0000-0000-00000000000a', 'evt-holiday', 'confirmed', 'Diwali',
    now() - interval '3 days', now() - interval '2 days', true, null),
  ('00000000-0000-0000-0000-00000000000a', 'evt-next-action', 'confirmed', 'Send ROI note',
    now() - interval '1 day', now() - interval '1 day' + interval '30 minutes', false,
    '30000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b', 'evt-b', 'confirmed', 'Diligence call',
    now() - interval '1 day', now() - interval '1 day' + interval '30 minutes', false, null);

-- An earlier touch, then the meeting the calendar logged.
insert into public.history (row_id, owner_id, kind, source, at, text, member_id) values
  ('30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'call', 'manual',
    now() - interval '5 days', 'Intro call', '00000000-0000-0000-0000-00000000000a');
select public.ua_calendar_log_meeting('00000000-0000-0000-0000-00000000000a',
  '30000000-0000-0000-0000-00000000000a', 'evt-past', now() - interval '2 days', 'Call with Rohan');

select is(
  (select last_touch_at from public.rows where id = '30000000-0000-0000-0000-00000000000a'),
  now() - interval '2 days',
  'A logged meeting is the last touch'
);

-- ---------- Dawar marks their own meetings ----------

set local role authenticated;
set local request.jwt.claims = '{"email":"dawar@example.test"}';

select lives_ok(
  $$ insert into public.calendar_meeting_outcomes (member_id, google_event_id, outcome)
     values ('00000000-0000-0000-0000-00000000000a', 'evt-past', 'missed') $$,
  'A member marks a meeting of their own that has ended as missed'
);
select is(
  (select last_touch_at from public.rows where id = '30000000-0000-0000-0000-00000000000a'),
  now() - interval '5 days',
  'Last touch skips the missed meeting'
);
select is(
  (select count(*) from public.history where source_event_key = 'evt-past'),
  1::bigint,
  'The meeting stays in history'
);
select throws_like(
  $$ insert into public.calendar_meeting_outcomes (member_id, google_event_id, outcome)
     values ('00000000-0000-0000-0000-00000000000a', 'evt-later', 'missed') $$,
  '%row-level security%',
  'A meeting that has not ended cannot be marked'
);
select throws_like(
  $$ insert into public.calendar_meeting_outcomes (member_id, google_event_id, outcome)
     values ('00000000-0000-0000-0000-00000000000a', 'evt-holiday', 'missed') $$,
  '%row-level security%',
  'An all-day event is not a meeting to mark'
);
select throws_like(
  $$ insert into public.calendar_meeting_outcomes (member_id, google_event_id, outcome)
     values ('00000000-0000-0000-0000-00000000000a', 'evt-next-action', 'missed') $$,
  '%row-level security%',
  'The CRM''s own next-action event is a follow-up, not a meeting to mark'
);
select throws_like(
  $$ insert into public.calendar_meeting_outcomes (member_id, google_event_id, outcome)
     values ('00000000-0000-0000-0000-00000000000b', 'evt-b', 'missed') $$,
  '%row-level security%',
  'A member cannot mark another member''s meeting'
);
select throws_like(
  $$ insert into public.calendar_meeting_outcomes (member_id, google_event_id, outcome)
     values ('00000000-0000-0000-0000-00000000000a', 'evt-b', 'missed') $$,
  '%row-level security%',
  '... nor claim it as their own'
);

-- ---------- Dhruv reads Dawar's marks and changes none ----------

set local request.jwt.claims = '{"email":"dhruv@example.test"}';

select is(
  (select outcome from public.calendar_meeting_outcomes where google_event_id = 'evt-past'),
  'missed',
  'Every member reads every member''s marks'
);
select lives_ok(
  $$ update public.calendar_meeting_outcomes set outcome = 'held'
     where member_id = '00000000-0000-0000-0000-00000000000a' $$,
  'Changing another member''s mark runs'
);
select lives_ok(
  $$ delete from public.calendar_meeting_outcomes
     where member_id = '00000000-0000-0000-0000-00000000000a' $$,
  'Deleting another member''s mark runs'
);
select is(
  (select outcome from public.calendar_meeting_outcomes where google_event_id = 'evt-past'),
  'missed',
  '... and neither changes it: marks change only by their owner'
);

set local request.jwt.claims = '{"email":"stranger@example.test"}';
select is(
  (select count(*) from public.calendar_meeting_outcomes),
  0::bigint,
  'Someone who is not a member reads no marks'
);

-- ---------- Dawar changes their mind, then takes the mark back ----------

set local request.jwt.claims = '{"email":"dawar@example.test"}';

select lives_ok(
  $$ update public.calendar_meeting_outcomes set outcome = 'held'
     where member_id = '00000000-0000-0000-0000-00000000000a' and google_event_id = 'evt-past' $$,
  'The owner marks the meeting held'
);
select is(
  (select last_touch_at from public.rows where id = '30000000-0000-0000-0000-00000000000a'),
  now() - interval '2 days',
  'and it is the last touch again'
);
select lives_ok(
  $$ update public.calendar_meeting_outcomes set outcome = 'missed'
     where member_id = '00000000-0000-0000-0000-00000000000a' and google_event_id = 'evt-past' $$,
  'Missed again'
);
select lives_ok(
  $$ delete from public.calendar_meeting_outcomes
     where member_id = '00000000-0000-0000-0000-00000000000a' and google_event_id = 'evt-past' $$,
  'The owner takes the mark back'
);
select is(
  (select last_touch_at from public.rows where id = '30000000-0000-0000-0000-00000000000a'),
  now() - interval '2 days',
  'and an unanswered meeting counts as held'
);

-- ---------- What the app reads ----------

reset role;
insert into public.calendar_meeting_outcomes (member_id, google_event_id, outcome)
values ('00000000-0000-0000-0000-00000000000a', 'evt-past', 'missed');

select is(
  (select public.ua_history_json(h) -> 'meta' from public.history h where h.source_event_key = 'evt-past'),
  '{"calendarEventId": "evt-past", "missed": true}'::jsonb,
  'A logged meeting carries its event and reads as missed'
);
select is(
  (select public.ua_history_json(h) -> 'meta' from public.history h where h.text = 'Intro call'),
  null,
  'Other entries read as before'
);
select is(
  (select count(*) from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public'
     and tablename = 'calendar_meeting_outcomes'),
  1::bigint,
  'Marks are published to Realtime, under the members-only policy'
);

select * from finish();
rollback;
