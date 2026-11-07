-- Cell formatting (7 Nov 2026, D-049): a fill colour per cell, a height per row and text
-- wrapping per column. Each function below is its previous definition with only these fields
-- added; nothing else changes.

alter table public.rows
  add column cell_colours jsonb not null default '{}'::jsonb
    check (jsonb_typeof(cell_colours) = 'object'),
  -- A height set by dragging the row's edge, in pixels; null is the default height.
  add column height int check (height between 36 and 240);

alter table public.columns
  add column wrap boolean not null default false;

-- ---------- Reading: the new fields in the JSON the app reads ----------

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
        'wrap', c.wrap,
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
    'lastTouchAt', public.ua_iso(r.last_touch_at),
    'createdAt', public.ua_iso(r.created_at),
    'updatedAt', public.ua_iso(r.updated_at),
    'createdBy', coalesce(r.created_by, r.owner_id),
    'updatedBy', coalesce(r.updated_by, r.created_by, r.owner_id),
    'deletedAt', public.ua_iso(r.deleted_at)
  )
$$;

-- ---------- Writing: the new fields saved with the row and the sheet ----------

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
    next_precision, notes, fields, cell_colours, height, deleted_at
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
    case when jsonb_typeof(p_row -> 'cellColours') = 'object' then p_row -> 'cellColours'
      else '{}'::jsonb end,
    (p_row ->> 'height')::int,
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
    cell_colours = excluded.cell_colours,
    height = excluded.height,
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

  perform public.ua_save_same_person(p_row);

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
    id, sheet_id, owner_id, key, label, type, system, options, width, hidden, wrap, position,
    deleted_at
  )
  select
    (c ->> 'id')::uuid, sid, null, c ->> 'key', c ->> 'label', c ->> 'type',
    coalesce((c ->> 'system')::boolean, false),
    case when jsonb_typeof(c -> 'options') = 'array'
      then array(select jsonb_array_elements_text(c -> 'options')) end,
    (c ->> 'width')::int,
    coalesce((c ->> 'hidden')::boolean, false),
    coalesce((c ->> 'wrap')::boolean, false),
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
    wrap = excluded.wrap,
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
