-- The app's API: functions that read and write whole domain objects (src/domain/schemas.ts) in
-- one round trip and one transaction. They run as the caller (security invoker), so every read
-- and write inside them passes the same row-level security as a direct query.

-- ---------- Schema adjustments ----------

-- Tags keep the order they were applied in.
alter table public.row_tags add column position int not null default 0 check (position >= 0);
create policy row_tags_update on public.row_tags for update to authenticated
  using (owner_id = (select public.current_member_id()))
  with check (owner_id = (select public.current_member_id()));

-- A link to a row that is purged from Trash goes with it (set null would break the one-target
-- check and block the purge).
alter table public.row_links drop constraint row_links_target_row_id_fkey;
alter table public.row_links
  add constraint row_links_target_row_id_fkey
  foreign key (target_row_id) references public.rows (id) on delete cascade;

-- ---------- JSON in the domain's shape ----------

-- "2026-11-05T04:30:00.000Z", exactly what Date.toISOString() writes, so the app can compare
-- instants as strings.
create or replace function public.ua_iso(ts timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

create or replace function public.ua_member_json(m public.members)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', m.id, 'slug', m.slug, 'name', m.name, 'email', m.email, 'position', m.position,
    'isAdmin', m.is_admin, 'active', m.active, 'createdAt', public.ua_iso(m.created_at)
  )
$$;

create or replace function public.ua_tag_json(t public.tags)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', t.id, 'name', t.name, 'colour', t.colour, 'createdBy', t.created_by,
    'createdAt', public.ua_iso(t.created_at)
  )
$$;

create or replace function public.ua_sheet_json(s public.sheets)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id,
    'memberId', s.owner_id,
    'slug', s.slug,
    'name', s.name,
    'template', s.template,
    'position', s.position,
    'columns', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', c.id, 'key', c.key, 'label', c.label, 'type', c.type, 'system', c.system,
        'options', to_jsonb(c.options), 'width', c.width, 'hidden', c.hidden,
        'position', c.position, 'deletedAt', public.ua_iso(c.deleted_at)
      )) order by c.position, c.created_at, c.id)
      from public.columns c where c.sheet_id = s.id
    ), '[]'::jsonb),
    'stages', coalesce((
      select jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name) order by st.position, st.id)
      from public.stages st where st.sheet_id = s.id
    ), '[]'::jsonb),
    'createdAt', public.ua_iso(s.created_at),
    'updatedAt', public.ua_iso(s.updated_at),
    'deletedAt', public.ua_iso(s.deleted_at)
  )
$$;

create or replace function public.ua_link_json(l public.row_links)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case
    when l.target_row_id is not null then jsonb_build_object('kind', 'row', 'rowId', l.target_row_id)
    else jsonb_build_object('kind', 'text', 'text', l.target_text)
  end
$$;

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
    'lastTouchAt', public.ua_iso(r.last_touch_at),
    'createdAt', public.ua_iso(r.created_at),
    'updatedAt', public.ua_iso(r.updated_at),
    'createdBy', coalesce(r.created_by, r.owner_id),
    'updatedBy', coalesce(r.updated_by, r.created_by, r.owner_id),
    'deletedAt', public.ua_iso(r.deleted_at)
  )
$$;

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
  ) || case when h.meta is null then '{}'::jsonb else jsonb_build_object('meta', h.meta) end
$$;

-- ---------- Reads ----------

create or replace function public.api_list_sheets(p_member uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.ua_sheet_json(s) order by s.position, s.created_at), '[]'::jsonb)
  from public.sheets s
  where s.owner_id = p_member and s.deleted_at is null
$$;

-- A sheet, live unless p_include_deleted (the owner restoring it from Trash).
create or replace function public.api_get_sheet(p_id uuid, p_include_deleted boolean default false)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select public.ua_sheet_json(s) from public.sheets s
  where s.id = p_id and (p_include_deleted or s.deleted_at is null)
$$;

create or replace function public.api_list_rows(p_sheet uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.ua_row_json(r) order by r.position, r.created_at), '[]'::jsonb)
  from public.rows r
  join public.sheets s on s.id = r.sheet_id
  where r.sheet_id = p_sheet and r.deleted_at is null and s.deleted_at is null
$$;

-- A row, live (in a live sheet) unless p_include_deleted (the owner working with Trash).
create or replace function public.api_get_row(p_id uuid, p_include_deleted boolean default false)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select public.ua_row_json(r)
  from public.rows r
  join public.sheets s on s.id = r.sheet_id
  where r.id = p_id and (p_include_deleted or (r.deleted_at is null and s.deleted_at is null))
$$;

-- Row, sheet and member together, for cross-tab jumps.
create or replace function public.api_row_location(p_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'row', public.ua_row_json(r), 'sheet', public.ua_sheet_json(s), 'member', public.ua_member_json(m)
  )
  from public.rows r
  join public.sheets s on s.id = r.sheet_id
  join public.members m on m.id = r.owner_id
  where r.id = p_id and r.deleted_at is null and s.deleted_at is null
$$;

create or replace function public.api_member_rows(p_member uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.ua_row_json(r) order by s.position, r.position), '[]'::jsonb)
  from public.rows r
  join public.sheets s on s.id = r.sheet_id
  where r.owner_id = p_member and r.deleted_at is null and s.deleted_at is null
$$;

create or replace function public.api_count_rows(p_member uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(s.id, (
    select count(*) from public.rows r where r.sheet_id = s.id and r.deleted_at is null
  )), '{}'::jsonb)
  from public.sheets s
  where s.owner_id = p_member and s.deleted_at is null
$$;

-- The caller's own Trash from the last 30 days, newest first.
create or replace function public.api_list_trash(p_now timestamptz default now())
returns jsonb
language sql
stable
set search_path = ''
as $$
  with me as (select public.current_member_id() as id),
  items as (
    select jsonb_build_object(
      'kind', 'sheet', 'id', s.id, 'sheetId', s.id, 'label', s.name,
      'deletedAt', public.ua_iso(s.deleted_at)
    ) as item, s.deleted_at as at, s.id as id
    from public.sheets s, me
    where s.owner_id = me.id and s.deleted_at >= p_now - interval '30 days'
    union all
    select jsonb_build_object(
      'kind', 'column', 'id', c.id, 'sheetId', c.sheet_id, 'label', c.label,
      'deletedAt', public.ua_iso(c.deleted_at)
    ), c.deleted_at, c.id
    from public.columns c
    join public.sheets s on s.id = c.sheet_id, me
    where c.owner_id = me.id and s.deleted_at is null
      and c.deleted_at >= p_now - interval '30 days'
    union all
    select jsonb_build_object(
      'kind', 'row', 'id', r.id, 'sheetId', r.sheet_id, 'label', r.name,
      'deletedAt', public.ua_iso(r.deleted_at)
    ), r.deleted_at, r.id
    from public.rows r, me
    where r.owner_id = me.id and r.deleted_at >= p_now - interval '30 days'
  )
  select coalesce(jsonb_agg(item order by at desc, id::text), '[]'::jsonb) from items
$$;

-- Everyone whose rows use a tag (Trash included, for the owner's own rows), by member.
create or replace function public.api_tag_usage(p_tag uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(distinct jsonb_build_object('memberId', m.id, 'name', m.name)), '[]'::jsonb)
  from public.row_tags rt
  join public.members m on m.id = rt.owner_id
  where rt.tag_id = p_tag and (select public.current_member_id()) is not null
$$;

-- ---------- Writes ----------

-- Saves a whole row (scalars, tags and links) and, when given, its history entry, together.
-- The owner comes from the sheet; last touch follows history. History instants stay strictly
-- increasing per row, so newest-first order is stable when a change and its undo land in the
-- same millisecond.
create or replace function public.api_save_row(p_row jsonb, p_history jsonb default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  rid uuid := (p_row ->> 'id')::uuid;
  at_ts timestamptz;
  saved_history public.history;
begin
  insert into public.rows as t (
    id, sheet_id, owner_id, position, name, company, title, phone, email, linkedin, links,
    warmth, stage_index, stage_dates, lost_stage_index, lost_date, next_text, next_date,
    next_precision, notes, fields, deleted_at
  ) values (
    rid,
    (p_row ->> 'sheetId')::uuid,
    null,
    coalesce((p_row ->> 'position')::int, 0),
    p_row ->> 'name',
    coalesce(p_row ->> 'company', ''),
    coalesce(p_row ->> 'title', ''),
    coalesce(p_row ->> 'phone', ''),
    coalesce(p_row ->> 'email', ''),
    coalesce(p_row ->> 'linkedin', ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_row -> 'links', '[]'::jsonb))), '{}'),
    p_row ->> 'warmth',
    (p_row ->> 'stageIndex')::int,
    coalesce(p_row -> 'stageDates', '{}'::jsonb),
    (p_row -> 'lost' ->> 'stageIndex')::int,
    (p_row -> 'lost' ->> 'date')::date,
    nullif(p_row -> 'nextAction' ->> 'text', ''),
    (p_row -> 'nextAction' -> 'date' ->> 'date')::date,
    p_row -> 'nextAction' -> 'date' ->> 'precision',
    coalesce(p_row ->> 'notes', ''),
    coalesce(p_row -> 'fields', '{}'::jsonb),
    (p_row ->> 'deletedAt')::timestamptz
  )
  on conflict (id) do update set
    sheet_id = excluded.sheet_id,
    position = excluded.position,
    name = excluded.name,
    company = excluded.company,
    title = excluded.title,
    phone = excluded.phone,
    email = excluded.email,
    linkedin = excluded.linkedin,
    links = excluded.links,
    warmth = excluded.warmth,
    stage_index = excluded.stage_index,
    stage_dates = excluded.stage_dates,
    lost_stage_index = excluded.lost_stage_index,
    lost_date = excluded.lost_date,
    next_text = excluded.next_text,
    next_date = excluded.next_date,
    next_precision = excluded.next_precision,
    notes = excluded.notes,
    fields = excluded.fields,
    deleted_at = excluded.deleted_at;

  -- Tags, in the order given.
  delete from public.row_tags rt
  where rt.row_id = rid
    and rt.tag_id not in (
      select x::uuid from jsonb_array_elements_text(coalesce(p_row -> 'tagIds', '[]'::jsonb)) x
    );
  insert into public.row_tags (row_id, tag_id, owner_id, position)
  select rid, x::uuid, null, (ord - 1)::int
  from jsonb_array_elements_text(coalesce(p_row -> 'tagIds', '[]'::jsonb)) with ordinality as t(x, ord)
  on conflict (row_id, tag_id) do update set position = excluded.position;

  -- Introduced by and connects to are rewritten; "same person" links are kept.
  delete from public.row_links l
  where l.source_row_id = rid and l.kind in ('introduced_by', 'connects_to');
  if jsonb_typeof(p_row -> 'introducedBy') = 'object' then
    insert into public.row_links (source_row_id, owner_id, kind, target_row_id, target_text, position)
    values (
      rid, null, 'introduced_by',
      (p_row -> 'introducedBy' ->> 'rowId')::uuid,
      case when p_row -> 'introducedBy' ->> 'kind' = 'text' then p_row -> 'introducedBy' ->> 'text' end,
      0
    );
  end if;
  insert into public.row_links (source_row_id, owner_id, kind, target_row_id, target_text, position)
  select rid, null, 'connects_to', (l ->> 'rowId')::uuid,
    case when l ->> 'kind' = 'text' then l ->> 'text' end, (ord - 1)::int
  from jsonb_array_elements(coalesce(p_row -> 'connectsTo', '[]'::jsonb)) with ordinality as t(l, ord);

  if p_history is not null then
    at_ts := (p_history ->> 'at')::timestamptz;
    select greatest(at_ts, max(h.at) + interval '1 millisecond') into at_ts
    from public.history h where h.row_id = rid;
    insert into public.history (
      id, row_id, owner_id, kind, source, at, fuzzy_date, fuzzy_precision, text, member_id, meta
    ) values (
      coalesce((p_history ->> 'id')::uuid, gen_random_uuid()),
      rid,
      null,
      p_history ->> 'kind',
      coalesce(p_history ->> 'source', 'system'),
      at_ts,
      (p_history -> 'fuzzyDate' ->> 'date')::date,
      p_history -> 'fuzzyDate' ->> 'precision',
      coalesce(p_history ->> 'text', ''),
      coalesce((p_history ->> 'memberId')::uuid, public.current_member_id()),
      case when jsonb_typeof(p_history -> 'meta') = 'object' then p_history -> 'meta' end
    )
    returning * into saved_history;
  end if;

  return jsonb_build_object(
    'row', (select public.ua_row_json(r) from public.rows r where r.id = rid),
    'history', case when saved_history.id is null then null
      else public.ua_history_json(saved_history) end
  );
end
$$;

-- Several rows with their history entries, all or none: [{ row, history? }, ...].
create or replace function public.api_save_rows(p_items jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  item jsonb;
  results jsonb := '[]'::jsonb;
begin
  for item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    results := results || jsonb_build_array(
      public.api_save_row(item -> 'row', case when jsonb_typeof(item -> 'history') = 'object' then item -> 'history' end)
    );
  end loop;
  return results;
end
$$;

-- Extra history entries for one row (imports carry several dated touches).
create or replace function public.api_add_history(p_row uuid, p_entries jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  entry jsonb;
  saved public.history;
  results jsonb := '[]'::jsonb;
begin
  for entry in select value from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) loop
    insert into public.history (
      id, row_id, owner_id, kind, source, at, fuzzy_date, fuzzy_precision, text, member_id, meta
    ) values (
      coalesce((entry ->> 'id')::uuid, gen_random_uuid()),
      p_row,
      null,
      entry ->> 'kind',
      coalesce(entry ->> 'source', 'manual'),
      (entry ->> 'at')::timestamptz,
      (entry -> 'fuzzyDate' ->> 'date')::date,
      entry -> 'fuzzyDate' ->> 'precision',
      coalesce(entry ->> 'text', ''),
      coalesce((entry ->> 'memberId')::uuid, public.current_member_id()),
      case when jsonb_typeof(entry -> 'meta') = 'object' then entry -> 'meta' end
    )
    returning * into saved;
    results := results || jsonb_build_array(public.ua_history_json(saved));
  end loop;
  return results;
end
$$;

-- Moves rows to Trash (p_deleted_at) or back (null), all or none.
create or replace function public.api_set_rows_deleted(p_ids uuid[], p_deleted_at timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
declare
  changed int;
begin
  update public.rows r set deleted_at = p_deleted_at
  where r.id = any(p_ids)
    and (case when p_deleted_at is null then r.deleted_at is not null else r.deleted_at is null end);
  get diagnostics changed = row_count;
  if changed <> cardinality(array(select distinct unnest(p_ids))) then
    raise exception 'Some of those rows are not yours, or already moved'
      using errcode = 'insufficient_privilege';
  end if;
end
$$;

-- Saves a whole sheet: the sheet, every column (Trash included) and its stages, in order.
-- Stages missing from the list are removed. p_rows, when given, are saved in the same
-- transaction (rows moved off a removed stage).
create or replace function public.api_save_sheet(p_sheet jsonb, p_rows jsonb default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  sid uuid := (p_sheet ->> 'id')::uuid;
begin
  insert into public.sheets as t (id, owner_id, slug, name, template, position, deleted_at)
  values (
    sid,
    (p_sheet ->> 'memberId')::uuid,
    p_sheet ->> 'slug',
    p_sheet ->> 'name',
    p_sheet ->> 'template',
    coalesce((p_sheet ->> 'position')::int, 0),
    (p_sheet ->> 'deletedAt')::timestamptz
  )
  on conflict (id) do update set
    slug = excluded.slug,
    name = excluded.name,
    position = excluded.position,
    deleted_at = excluded.deleted_at;

  insert into public.columns as t (
    id, sheet_id, owner_id, key, label, type, system, options, width, hidden, position, deleted_at
  )
  select
    (c ->> 'id')::uuid, sid, null, c ->> 'key', c ->> 'label', c ->> 'type',
    coalesce((c ->> 'system')::boolean, false),
    case when jsonb_typeof(c -> 'options') = 'array'
      then array(select jsonb_array_elements_text(c -> 'options')) end,
    (c ->> 'width')::int,
    coalesce((c ->> 'hidden')::boolean, false),
    coalesce((c ->> 'position')::int, 0),
    (c ->> 'deletedAt')::timestamptz
  from jsonb_array_elements(coalesce(p_sheet -> 'columns', '[]'::jsonb)) c
  on conflict (id) do update set
    key = excluded.key,
    label = excluded.label,
    type = excluded.type,
    options = excluded.options,
    width = excluded.width,
    hidden = excluded.hidden,
    position = excluded.position,
    deleted_at = excluded.deleted_at;

  delete from public.columns c
  where c.sheet_id = sid
    and c.id not in (
      select (x ->> 'id')::uuid from jsonb_array_elements(coalesce(p_sheet -> 'columns', '[]'::jsonb)) x
    );

  delete from public.stages st
  where st.sheet_id = sid
    and st.id not in (
      select (x ->> 'id')::uuid from jsonb_array_elements(coalesce(p_sheet -> 'stages', '[]'::jsonb)) x
    );
  insert into public.stages as t (id, sheet_id, owner_id, name, position)
  select (st ->> 'id')::uuid, sid, null, st ->> 'name', (ord - 1)::int
  from jsonb_array_elements(coalesce(p_sheet -> 'stages', '[]'::jsonb)) with ordinality as x(st, ord)
  on conflict (id) do update set name = excluded.name, position = excluded.position;

  if p_rows is not null then
    perform public.api_save_rows(p_rows);
  end if;

  return (select public.ua_sheet_json(s) from public.sheets s where s.id = sid);
end
$$;

-- ---------- Search across every tab ----------

-- Lowercase, accent-free word tokens, as the app's searchTokens() makes them.
create or replace function public.ua_tokens(value text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(distinct t), '{}')
  from regexp_split_to_table(public.ua_unaccent(lower(coalesce(value, ''))), '[^a-z0-9]+') t
  where t <> ''
$$;

-- Digit forms of a phone: all digits, the national number, its leading zero form and the two
-- display groups of an Indian mobile ("+91 98450 12345").
create or replace function public.ua_phone_tokens(value text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  with d as (select regexp_replace(coalesce(value, ''), '\D', '', 'g') as digits)
  select case
    when digits = '' then '{}'::text[]
    when value like '+91%' and length(digits) = 12 then array[
      digits, '91', substr(digits, 3), '0' || substr(digits, 3), substr(digits, 3, 5), substr(digits, 8)
    ]
    else array[digits]
  end
  from d
$$;

-- Every query token must prefix-match a word of some field; the score sums each token's best
-- match (name 100, company 60, title 40, email and phone 30, tags 20, connects to 15, notes 10),
-- with a bonus when the whole query starts the name. Names also match by trigram similarity, so
-- a typo still finds the person. Results carry their sheet and member.
create or replace function public.api_search(p_query text, p_limit int default 50)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with q as (
    select unnest(public.ua_tokens(p_query)) as tok
  ),
  qn as (select count(*) as n from q),
  qname as (select public.ua_normalise_name(p_query) as spaced),
  live as (
    select r.*
    from public.rows r
    join public.sheets s on s.id = r.sheet_id
    where r.deleted_at is null and s.deleted_at is null
  ),
  fields as (
    select r.id as row_id, f.field, f.weight, f.txt, f.toks
    from live r
    cross join lateral (
      values
        ('name', 100, r.name,
          public.ua_tokens(r.name) || array[replace(public.ua_normalise_name(r.name), ' ', '')]),
        ('company', 60, r.company, public.ua_tokens(r.company)),
        ('title', 40, r.title, public.ua_tokens(r.title)),
        ('email', 30, r.email, public.ua_tokens(r.email) || array[lower(trim(r.email))]),
        ('phone', 30, r.phone, public.ua_phone_tokens(r.phone)),
        ('notes', 10, r.notes, public.ua_tokens(r.notes))
    ) as f(field, weight, txt, toks)
    where coalesce(trim(f.txt), '') <> ''
    union all
    select rt.row_id, 'tags', 20, t.name, public.ua_tokens(t.name)
    from public.row_tags rt
    join public.tags t on t.id = rt.tag_id
    join live r on r.id = rt.row_id
    union all
    select l.source_row_id, 'connectsTo', 15, coalesce(target.name, l.target_text),
      public.ua_tokens(coalesce(target.name, l.target_text))
    from public.row_links l
    join live r on r.id = l.source_row_id
    left join public.rows target on target.id = l.target_row_id
    where l.kind = 'connects_to'
  ),
  token_scores as (
    select f.row_id, q.tok, f.field, f.txt,
      max(f.weight * case when w = q.tok then 1.0 else 0.6 + 0.3 * length(q.tok)::numeric / length(w) end) as score
    from fields f
    cross join q
    cross join lateral unnest(f.toks) w
    where w like q.tok || '%'
    group by f.row_id, q.tok, f.field, f.txt
  ),
  best_per_token as (
    select distinct on (row_id, tok) row_id, tok, field, txt, score
    from token_scores
    order by row_id, tok, score desc
  ),
  prefix_hits as (
    select row_id, sum(score) as total, count(distinct tok) as matched
    from best_per_token group by row_id
  ),
  prefix_rows as (
    select p.row_id, p.total
    from prefix_hits p, qn
    where p.matched = qn.n and qn.n > 0
  ),
  fuzzy_rows as (
    select r.id as row_id, 100 * extensions.similarity(r.name_key, qname.spaced) as total
    from live r, qname
    where length(qname.spaced) >= 3
      and extensions.similarity(r.name_key, qname.spaced) >= 0.35
      and r.id not in (select row_id from prefix_rows)
  ),
  hits as (
    select row_id, total from prefix_rows
    union all
    select row_id, total from fuzzy_rows
  ),
  matched_field as (
    select distinct on (row_id) row_id, field, txt
    from (
      select row_id, field, txt, sum(score) as s from best_per_token group by row_id, field, txt
    ) x
    order by row_id, s desc
  ),
  ranked as (
    select r.id, r.name,
      round((h.total + case
        when length(qname.spaced) > 0 and public.ua_normalise_name(r.name) like qname.spaced || '%'
        then 50 else 0 end)::numeric, 2) as score,
      coalesce(mf.field, 'name') as field,
      coalesce(mf.txt, r.name) as txt
    from hits h
    join live r on r.id = h.row_id
    cross join qname
    left join matched_field mf on mf.row_id = h.row_id
    order by score desc, lower(r.name), r.id
    limit greatest(coalesce(p_limit, 50), 1)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'row', public.ua_row_json(r),
    'sheet', public.ua_sheet_json(s),
    'member', public.ua_member_json(m),
    'score', k.score,
    'matchedField', k.field,
    'matchedText', k.txt
  ) order by k.score desc, lower(k.name), k.id), '[]'::jsonb)
  from ranked k
  join public.rows r on r.id = k.id
  join public.sheets s on s.id = r.sheet_id
  join public.members m on m.id = r.owner_id
$$;

-- ---------- Trash older than 30 days is purged every night (02:00 IST) ----------

create or replace function public.ua_purge_trash()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cutoff timestamptz := now() - interval '30 days';
begin
  delete from public.rows r using public.sheets s
  where r.sheet_id = s.id and s.deleted_at < cutoff;
  delete from public.rows where deleted_at < cutoff;
  delete from public.sheets where deleted_at < cutoff;
  delete from public.columns where deleted_at < cutoff;
end
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('ua-purge-trash', '30 20 * * *', 'select public.ua_purge_trash()');
  end if;
end
$$;

-- ---------- Who may call what ----------

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.ua_purge_trash() from public, anon, authenticated;
