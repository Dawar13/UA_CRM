-- Ownership (CLAUDE.md §2.14) at the database: every member reads, only the owner writes, and
-- another member is refused on every table. Run with `supabase test db` (CI). Members are
-- identified by the email claim in their JWT, so no auth users are needed here.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local timezone = 'UTC';

select plan(59);

-- ---------- Team (as the service, before anyone signs in) ----------

insert into public.members (id, email, name, slug, position, is_admin) values
  ('00000000-0000-0000-0000-00000000000a', 'dawar@example.test', 'Dawar', 'dawar', 0, true),
  ('00000000-0000-0000-0000-00000000000b', 'dhruv@example.test', 'Dhruv', 'dhruv', 1, true),
  ('00000000-0000-0000-0000-00000000000c', 'asha@example.test', 'Asha', 'asha', 2, false),
  ('00000000-0000-0000-0000-00000000000d', 'gone@example.test', 'Gone', 'gone', 3, false);
update public.members set active = false where slug = 'gone';

-- ---------- Identity keys mirror src/domain/identity.ts ----------

select is(public.ua_normalise_name('Prof. Dr A Kumar'), 'a kumar', 'Names drop leading titles');
select is(public.ua_normalise_name('Dr'), 'dr', 'A name is never reduced to nothing');
select is(public.ua_normalise_company('Hosur Precision Forge Pvt. Ltd.'), 'hosur precision forge', 'Companies drop legal suffixes');
select is(public.ua_normalise_email(' Rohan@HPF.in '), 'rohan@hpf.in', 'Emails are trimmed and lowercased');
select is(public.ua_linkedin_slug('https://www.linkedin.com/in/RohanMehta/'), 'rohanmehta', 'LinkedIn URLs give their slug');
select is(public.ua_phone_key('98450 12345'), null, 'Only E.164 phones have a key');

-- ---------- Who counts as a member ----------

set local role authenticated;
set local request.jwt.claims = '{"email":"stranger@example.test"}';
select is(public.current_member_id(), null, 'A signed-in stranger has no membership');
select is((select count(*) from public.members), 0::bigint, 'A stranger reads nothing');

set local request.jwt.claims = '{"email":"gone@example.test"}';
select is(public.current_member_id(), null, 'A deactivated member has no membership');

-- ---------- Dawar writes in their own tab ----------

set local request.jwt.claims = '{"email":"Dawar@Example.test"}';

select lives_ok($$
  insert into public.sheets (id, owner_id, slug, name, template) values
    ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'customers', 'Customers', 'customers')
$$, 'A member creates a sheet');
select is(
  (select owner_id from public.sheets where id = '10000000-0000-0000-0000-000000000001'),
  '00000000-0000-0000-0000-00000000000a'::uuid,
  'A new sheet belongs to the signed-in member, whatever the client sent'
);

select lives_ok($$
  insert into public.stages (id, sheet_id, owner_id, name, position) values
    ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'Identified', 0);
  insert into public.rows (id, sheet_id, owner_id, name, company, phone, email, linkedin, last_touch_at) values
    ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
     'Rohan Mehta', 'Hosur Precision Forge Pvt Ltd', '+919845012345', 'Rohan@hpf.in', 'linkedin.com/in/rohanmehta', '2020-01-01T00:00:00Z')
$$, 'A member adds stages and rows to their sheet');
select is(
  (select owner_id from public.rows where id = '30000000-0000-0000-0000-000000000001'),
  '00000000-0000-0000-0000-00000000000a'::uuid,
  'A row belongs to the owner of its sheet'
);
select is(
  (select last_touch_at from public.rows where id = '30000000-0000-0000-0000-000000000001'),
  null,
  'The client cannot set last touch'
);
select is(
  (select created_by from public.rows where id = '30000000-0000-0000-0000-000000000001'),
  '00000000-0000-0000-0000-00000000000a'::uuid,
  'created_by names the signed-in member'
);
select is(
  (select company_key from public.rows where id = '30000000-0000-0000-0000-000000000001'),
  'hosur precision forge',
  'Identity keys are generated on the row'
);

select lives_ok($$
  insert into public.history (row_id, owner_id, kind, source, at, text, member_id) values
    ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'call', 'manual', '2026-11-05T06:00:00Z', 'Called', '00000000-0000-0000-0000-00000000000b'),
    ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'note', 'manual', '2026-11-01T06:00:00Z', 'Older', '00000000-0000-0000-0000-00000000000b')
$$, 'A member logs history on their row');
select is(
  (select last_touch_at from public.rows where id = '30000000-0000-0000-0000-000000000001'),
  '2026-11-05T06:00:00Z'::timestamptz,
  'Last touch is the newest history entry'
);
select is(
  (select array_agg(distinct member_id) from public.history),
  array['00000000-0000-0000-0000-00000000000a'::uuid],
  'History names the member who logged it'
);

update public.rows set last_touch_at = '2030-01-01T00:00:00Z', title = 'Plant Head'
  where id = '30000000-0000-0000-0000-000000000001';
select is(
  (select last_touch_at from public.rows where id = '30000000-0000-0000-0000-000000000001'),
  '2026-11-05T06:00:00Z'::timestamptz,
  'An update from the client keeps last touch'
);

delete from public.history where text = 'Called';
select is(
  (select last_touch_at from public.rows where id = '30000000-0000-0000-0000-000000000001'),
  '2026-11-01T06:00:00Z'::timestamptz,
  'Deleting history recomputes last touch'
);

select lives_ok($$
  insert into public.tags (id, name, colour) values ('40000000-0000-0000-0000-000000000001', 'foundry', 'amber');
  insert into public.row_tags (row_id, tag_id, owner_id) values
    ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b')
$$, 'A member creates a tag and applies it');
select lives_ok($$
  insert into public.row_links (source_row_id, owner_id, kind, target_text) values
    ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'connects_to', 'Tata Steel');
  insert into public.files (id, row_id, owner_id, name, size, mime_type, storage_path) values
    ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
     'deck.pdf', 1200, 'application/pdf', '00000000-0000-0000-0000-00000000000a/30000000-0000-0000-0000-000000000001/deck.pdf')
$$, 'A member adds links and files to their row');

set local request.jwt.claims = '{"email":"gone@example.test"}';
select is(
  (select count(*) from public.sheets) + (select count(*) from public.rows) + (select count(*) from public.members),
  0::bigint,
  'A deactivated member reads nothing'
);

-- ---------- Dhruv reads Dawar's tab and cannot change it ----------

set local request.jwt.claims = '{"email":"dhruv@example.test"}';

select is(
  (select jsonb_build_object(
    'sheets', (select count(*) from public.sheets),
    'rows', (select count(*) from public.rows),
    'history', (select count(*) from public.history),
    'tags', (select count(*) from public.tags),
    'links', (select count(*) from public.row_links),
    'files', (select count(*) from public.files),
    'members', (select count(*) from public.members)
  )),
  '{"sheets":1,"rows":1,"history":1,"tags":1,"links":1,"files":1,"members":4}'::jsonb,
  'Another member reads sheets, rows, history, tags, links, files and the team'
);
select is_empty($$ update public.rows set name = 'Changed' returning id $$, 'Another member cannot edit a row');
select is_empty($$ delete from public.rows returning id $$, 'Another member cannot delete a row');
select is_empty($$ delete from public.history returning id $$, 'Another member cannot delete history');
select is_empty($$ update public.sheets set name = 'Changed' returning id $$, 'Another member cannot rename a sheet');
select is_empty($$ delete from public.row_links returning id $$, 'Another member cannot delete a link');
select is_empty($$ update public.files set name = 'x.pdf' returning id $$, 'Another member cannot change a file');
select throws_like($$
  insert into public.row_links (source_row_id, owner_id, kind, target_text) values
    ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'connects_to', 'Sneaky')
$$, '%row-level security%', 'Another member cannot add a link from a row that is not theirs');
select throws_like($$
  insert into public.files (row_id, owner_id, name, size, storage_path) values
    ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'x.pdf', 1, 'x/y/z.pdf')
$$, '%row-level security%', 'Another member cannot attach a file');
select throws_like($$
  insert into public.rows (sheet_id, owner_id, name) values
    ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'Sneaky')
$$, '%row-level security%', 'Another member cannot add a row');
select throws_like($$
  insert into public.history (row_id, owner_id, kind, source, at, member_id) values
    ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'note', 'manual', now(), '00000000-0000-0000-0000-00000000000b')
$$, '%row-level security%', 'Another member cannot add history');
select throws_like($$
  insert into public.row_tags (row_id, tag_id, owner_id) values
    ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b')
$$, '%row-level security%', 'Another member cannot tag a row');
select throws_like($$
  insert into public.columns (sheet_id, owner_id, key, label, type, width) values
    ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'extra', 'Extra', 'text', 100)
$$, '%row-level security%', 'Another member cannot add a column');
select throws_like($$
  insert into public.stages (sheet_id, owner_id, name, position) values
    ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'Extra', 1)
$$, '%row-level security%', 'Another member cannot add a stage');
select throws_like(
  $$ update public.tags set name = 'forge' $$,
  '%created this tag%',
  'Only the creator can rename a tag'
);

select lives_ok($$
  insert into public.sheets (id, owner_id, slug, name, template) values
    ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'customers', 'Customers', 'customers');
  insert into public.rows (id, sheet_id, owner_id, name) values
    ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'Priya Nair');
  insert into public.row_tags (row_id, tag_id, owner_id) values
    ('30000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a')
$$, 'Any member applies a shared tag to their own rows');
select lives_ok($$
  insert into public.row_links (source_row_id, owner_id, kind, target_row_id) values
    ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'introduced_by', '30000000-0000-0000-0000-000000000001')
$$, 'A member links their row to another member''s row');
select throws_like($$
  update public.rows set sheet_id = '10000000-0000-0000-0000-000000000001'
  where id = '30000000-0000-0000-0000-000000000002'
$$, '%row-level security%', 'A row cannot be moved into another member''s sheet');

-- ---------- Tags in use by others are frozen; Trash is private ----------

set local request.jwt.claims = '{"email":"dawar@example.test"}';

select throws_like(
  $$ update public.tags set colour = 'teal' $$,
  '%used on rows of Dhruv%',
  'A tag another member uses cannot be changed, and the refusal names them'
);
select lives_ok(
  $$ update public.rows set deleted_at = now() where id = '30000000-0000-0000-0000-000000000001' $$,
  'The owner moves a row to Trash'
);
select is(
  (select jsonb_build_object('rows', (select count(*) from public.rows), 'history', (select count(*) from public.history))),
  '{"rows":2,"history":1}'::jsonb,
  'The owner still sees their trashed row and its history'
);

set local request.jwt.claims = '{"email":"dhruv@example.test"}';
select is(
  (select jsonb_build_object('rows', (select count(*) from public.rows), 'history', (select count(*) from public.history))),
  '{"rows":1,"history":0}'::jsonb,
  'Nobody else sees another member''s Trash'
);

-- ---------- Members: admins add and deactivate; nobody changes their own rights ----------

set local request.jwt.claims = '{"email":"asha@example.test"}';
select throws_like(
  $$ insert into public.members (email, name, slug) values ('new@example.test', 'New', 'new') $$,
  '%Only an admin%',
  'A regular member cannot add members'
);
select is_empty(
  $$ update public.members set is_admin = true where slug = 'dawar' returning id $$,
  'A regular member cannot change another member'
);
select throws_like(
  $$ update public.members set is_admin = true where slug = 'asha' $$,
  '%your own admin%',
  'A member cannot make themselves an admin'
);
select lives_ok(
  $$ update public.members set name = 'Asha R' where slug = 'asha' $$,
  'A member can change their own name'
);

set local request.jwt.claims = '{"email":"dhruv@example.test"}';
select lives_ok($$
  insert into public.members (email, name, slug, position) values ('new@example.test', 'New', 'new', 4);
  update public.members set active = false where slug = 'asha'
$$, 'An admin adds and deactivates members');
select throws_like(
  $$ update public.members set active = false where slug = 'dhruv' $$,
  '%your own admin%',
  'An admin cannot deactivate themselves'
);

-- ---------- Storage: each member writes only under their own folder ----------

select lives_ok($$
  insert into storage.objects (bucket_id, name) values ('row-files', '00000000-0000-0000-0000-00000000000b/r1/f1.pdf')
$$, 'A member uploads into their own folder');
select throws_like($$
  insert into storage.objects (bucket_id, name) values ('row-files', '00000000-0000-0000-0000-00000000000a/r1/f1.pdf')
$$, '%row-level security%', 'A member cannot upload into another member''s folder');

-- ---------- Sign-up gate (runs as the auth service) ----------

reset role;
select is(
  public.hook_before_user_created('{"user":{"email":"NEW@example.test"}}'),
  '{}'::jsonb,
  'A listed, active member can create their user'
);
select is(
  public.hook_before_user_created('{"user":{"email":"asha@example.test"}}') -> 'error' ->> 'http_code',
  '403',
  'A deactivated member cannot create a user'
);
select is(
  public.hook_before_user_created('{"user":{"email":"stranger@example.test"}}') -> 'error' ->> 'http_code',
  '403',
  'A stranger cannot create a user'
);

-- ---------- Anonymous visitors and Realtime ----------

set local role anon;
select throws_like($$ select count(*) from public.rows $$, '%permission denied%', 'Anonymous visitors read nothing');
reset role;

select is(
  (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'),
  10::bigint,
  'Every shared table is published to Realtime'
);

select * from finish();
rollback;
