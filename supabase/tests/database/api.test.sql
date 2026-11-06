-- The app's API functions (20261107090000_api.sql): whole domain objects in and out, one
-- transaction each, and the same ownership as the tables underneath. Run with
-- `supabase test db` (CI).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local timezone = 'UTC';

select plan(37);

insert into public.members (id, email, name, slug, position, is_admin) values
  ('00000000-0000-0000-0000-00000000000a', 'dawar@example.test', 'Dawar', 'dawar', 0, true),
  ('00000000-0000-0000-0000-00000000000b', 'dhruv@example.test', 'Dhruv', 'dhruv', 1, true),
  ('00000000-0000-0000-0000-00000000000d', 'gone@example.test', 'Gone', 'gone', 2, false);
update public.members set active = false where slug = 'gone';

-- ---------- Dawar saves a sheet, then a row with its history ----------

set local role authenticated;
set local request.jwt.claims = '{"email":"dawar@example.test"}';

select lives_ok($$
  select public.api_save_sheet('{
    "id": "10000000-0000-0000-0000-000000000001", "memberId": "00000000-0000-0000-0000-00000000000b",
    "slug": "customers", "name": "Customers", "template": "customers", "position": 0,
    "columns": [
      {"id": "11000000-0000-0000-0000-000000000001", "key": "name", "label": "Name", "type": "text", "system": true, "width": 240, "hidden": false, "position": 0},
      {"id": "11000000-0000-0000-0000-000000000002", "key": "archetype", "label": "Archetype", "type": "dropdown", "system": false, "options": ["Foundries", "Pharma"], "width": 160, "hidden": false, "position": 1}
    ],
    "stages": [
      {"id": "12000000-0000-0000-0000-000000000001", "name": "Identified"},
      {"id": "12000000-0000-0000-0000-000000000002", "name": "First call"},
      {"id": "12000000-0000-0000-0000-000000000003", "name": "Paid"}
    ],
    "deletedAt": null
  }'::jsonb)
$$, 'A member saves a whole sheet');

select is(
  public.api_get_sheet('10000000-0000-0000-0000-000000000001') -> 'memberId',
  to_jsonb('00000000-0000-0000-0000-00000000000a'::text),
  'The sheet belongs to the signed-in member, whatever the client sent'
);
select is(
  jsonb_array_length(public.api_get_sheet('10000000-0000-0000-0000-000000000001') -> 'stages'),
  3,
  'Stages come back in order'
);
select is(
  public.api_get_sheet('10000000-0000-0000-0000-000000000001') -> 'columns' -> 1 -> 'options',
  '["Foundries", "Pharma"]'::jsonb,
  'Dropdown options come back as given'
);

select lives_ok($$
  insert into public.tags (id, name, colour) values ('40000000-0000-0000-0000-000000000001', 'foundry', 'amber');
  insert into public.tags (id, name, colour) values ('40000000-0000-0000-0000-000000000002', 'pilot', 'teal')
$$, 'A member creates tags');

select lives_ok($$
  select public.api_save_row(
    '{
      "id": "30000000-0000-0000-0000-000000000001", "sheetId": "10000000-0000-0000-0000-000000000001",
      "position": 0, "name": "Rohan Mehta", "company": "Hosur Precision Forge", "title": "Plant Head",
      "phone": "+919845012345", "email": "rohan@hpf.in", "linkedin": "", "links": ["hpf.in"],
      "warmth": "warm", "stageIndex": 1, "stageDates": {"12000000-0000-0000-0000-000000000002": "2026-11-05"},
      "lost": null, "tagIds": ["40000000-0000-0000-0000-000000000002", "40000000-0000-0000-0000-000000000001"],
      "nextAction": {"text": "Send ROI note", "date": {"date": "2026-11-15", "precision": "mid-month"}},
      "introducedBy": {"kind": "text", "text": "Krithik"},
      "connectsTo": [{"kind": "text", "text": "Tata Steel"}],
      "notes": "Four heading lines", "fields": {"archetype": "Foundries"}, "deletedAt": null
    }'::jsonb,
    '{"id": "50000000-0000-0000-0000-000000000001", "kind": "created", "source": "system",
      "at": "2026-11-05T04:30:00.000Z", "fuzzyDate": null, "text": "Added to Customers"}'::jsonb
  )
$$, 'A member saves a row with its first history entry');

select is(
  public.api_get_row('30000000-0000-0000-0000-000000000001') -> 'tagIds',
  '["40000000-0000-0000-0000-000000000002", "40000000-0000-0000-0000-000000000001"]'::jsonb,
  'Tags keep the order they were applied in'
);
select is(
  public.api_get_row('30000000-0000-0000-0000-000000000001') -> 'nextAction',
  '{"text": "Send ROI note", "date": {"date": "2026-11-15", "precision": "mid-month"}}'::jsonb,
  'The next action keeps its fuzzy date'
);
select is(
  public.api_get_row('30000000-0000-0000-0000-000000000001') ->> 'lastTouchAt',
  '2026-11-05T04:30:00.000Z',
  'Last touch follows history, written as toISOString() writes it'
);
select is(
  jsonb_build_array(
    public.api_get_row('30000000-0000-0000-0000-000000000001') -> 'introducedBy',
    public.api_get_row('30000000-0000-0000-0000-000000000001') -> 'connectsTo' -> 0
  ),
  '[{"kind": "text", "text": "Krithik"}, {"kind": "text", "text": "Tata Steel"}]'::jsonb,
  'Links come back as link references'
);
select is(
  public.api_get_row('30000000-0000-0000-0000-000000000001') ->> 'memberId',
  '00000000-0000-0000-0000-00000000000a',
  'A row belongs to the owner of its sheet'
);

select is(
  public.api_save_row(
    public.api_get_row('30000000-0000-0000-0000-000000000001') || '{"warmth": "cold"}'::jsonb,
    '{"kind": "warmth", "source": "system", "at": "2026-11-05T04:30:00.000Z", "text": "Warmth set to Cold"}'::jsonb
  ) -> 'history' ->> 'at',
  '2026-11-05T04:30:00.001Z',
  'History instants stay strictly increasing per row'
);
select is(
  (select count(*) from public.history where row_id = '30000000-0000-0000-0000-000000000001'),
  2::bigint,
  'A row change and its history entry are saved together'
);
select is(
  public.api_get_row('30000000-0000-0000-0000-000000000001') -> 'tagIds',
  '["40000000-0000-0000-0000-000000000002", "40000000-0000-0000-0000-000000000001"]'::jsonb,
  'Saving the whole row again keeps its tags'
);

select lives_ok($$
  select public.api_save_rows('[
    {"row": {"id": "30000000-0000-0000-0000-000000000002", "sheetId": "10000000-0000-0000-0000-000000000001",
      "position": 1, "name": "Priya Nair", "company": "Kovai Castings", "phone": "", "email": "", "linkedin": "",
      "links": [], "warmth": null, "stageIndex": null, "stageDates": {}, "lost": null, "tagIds": [],
      "nextAction": null, "introducedBy": {"kind": "row", "rowId": "30000000-0000-0000-0000-000000000001"},
      "connectsTo": [], "notes": "", "fields": {}, "deletedAt": null},
     "history": {"kind": "created", "source": "system", "at": "2026-11-05T05:00:00.000Z", "text": "Added to Customers"}}
  ]'::jsonb)
$$, 'Several rows save in one call');
select is(
  jsonb_array_length(public.api_list_rows('10000000-0000-0000-0000-000000000001')),
  2,
  'A sheet lists its live rows'
);
select is(
  public.api_save_row(
    public.api_get_row('30000000-0000-0000-0000-000000000002')
      || '{"samePerson": ["30000000-0000-0000-0000-000000000001"]}'::jsonb
  ) -> 'row' -> 'samePerson',
  '["30000000-0000-0000-0000-000000000001"]'::jsonb,
  'A row saves its same-person links'
);
select is(
  public.api_same_person_of('30000000-0000-0000-0000-000000000001'),
  '["30000000-0000-0000-0000-000000000002"]'::jsonb,
  'The other row can find who links to it'
);

-- ---------- Dhruv reads everything and changes nothing ----------

set local request.jwt.claims = '{"email":"dhruv@example.test"}';

select is(
  public.api_list_rows('10000000-0000-0000-0000-000000000001') -> 0 ->> 'name',
  'Rohan Mehta',
  'Another member reads the rows of a sheet'
);
select is(
  public.api_row_location('30000000-0000-0000-0000-000000000002') -> 'member' ->> 'name',
  'Dawar',
  'A row location names its owner'
);
select throws_like(
  $$ select public.api_save_row(public.api_get_row('30000000-0000-0000-0000-000000000001') || '{"warmth": "warm"}'::jsonb) $$,
  '%row-level security%',
  'Another member cannot save a row'
);
select throws_like(
  $$ select public.api_save_row('{"id": "30000000-0000-0000-0000-000000000009", "sheetId": "10000000-0000-0000-0000-000000000001", "name": "Intruder"}'::jsonb) $$,
  '%row-level security%',
  'Another member cannot add a row to a sheet that is not theirs'
);
select throws_like(
  $$ select public.api_set_rows_deleted(array['30000000-0000-0000-0000-000000000001'::uuid], now()) $$,
  '%not yours%',
  'Another member cannot move a row to Trash'
);
select throws_like(
  $$ select public.api_save_sheet(public.api_get_sheet('10000000-0000-0000-0000-000000000001') || '{"name": "Mine now"}'::jsonb) $$,
  '%row-level security%',
  'Another member cannot change a sheet'
);
select is(
  public.api_search('rohan') -> 0 -> 'row' ->> 'name',
  'Rohan Mehta',
  'Search finds a name by its start, across tabs'
);
select is(
  public.api_search('98450') -> 0 ->> 'matchedField',
  'phone',
  'Search finds a phone by its digits'
);
select is(
  public.api_search('pilot') -> 0 ->> 'matchedField',
  'tags',
  'Search finds tags'
);
select is(
  public.api_search('rohn mehta') -> 0 -> 'row' ->> 'name',
  'Rohan Mehta',
  'Search forgives a typo in a name'
);
select is(
  (select jsonb_agg(e ->> 'kind') from jsonb_array_elements(public.api_list_history('30000000-0000-0000-0000-000000000001')) e),
  '["warmth", "created"]'::jsonb,
  'Another member reads a row''s history, newest first'
);
select is(
  jsonb_array_length(public.api_member_history('00000000-0000-0000-0000-00000000000a', '2026-11-05', '2026-11-06')),
  3,
  'History of a member''s rows over a range'
);
select is(public.api_me() ->> 'name', 'Dhruv', 'A member knows who they are signed in as');
set local request.jwt.claims = '{"email":"gone@example.test"}';
select is(public.api_me() ->> 'active', 'false', 'A deactivated member is told so, not treated as a stranger');
set local request.jwt.claims = '{"email":"dhruv@example.test"}';
select is(
  public.api_tag_usage('40000000-0000-0000-0000-000000000001'),
  '[{"name": "Dawar", "memberId": "00000000-0000-0000-0000-00000000000a"}]'::jsonb,
  'Tag usage names the members whose rows use it'
);

-- ---------- Trash ----------

set local request.jwt.claims = '{"email":"dawar@example.test"}';
select lives_ok(
  $$ select public.api_set_rows_deleted(array['30000000-0000-0000-0000-000000000002'::uuid], '2026-11-05T06:00:00Z') $$,
  'The owner moves a row to Trash'
);
select is(
  public.api_list_trash('2026-11-06T00:00:00Z') -> 0 ->> 'label',
  'Priya Nair',
  'The owner sees it in their Trash'
);

set local request.jwt.claims = '{"email":"dhruv@example.test"}';
select is(
  jsonb_array_length(public.api_list_trash('2026-11-06T00:00:00Z')),
  0,
  'Nobody else sees it'
);

reset role;
select throws_like(
  $$ set local role authenticated; select public.ua_purge_trash() $$,
  '%permission denied%',
  'Members cannot purge Trash themselves'
);

select * from finish();
rollback;
