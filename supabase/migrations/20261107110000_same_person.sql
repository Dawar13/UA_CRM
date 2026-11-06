-- "Same person" links (Copy to my sheet, Keep both linked) are saved with the row when the row
-- carries them. A row that does not mention samePerson keeps the links it has.
create or replace function public.ua_save_same_person(p_row jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  rid uuid := (p_row ->> 'id')::uuid;
begin
  if not (p_row ? 'samePerson') then
    return;
  end if;
  delete from public.row_links l where l.source_row_id = rid and l.kind = 'same_person';
  insert into public.row_links (source_row_id, owner_id, kind, target_row_id, position)
  select rid, null, 'same_person', x::uuid, (ord - 1)::int
  from jsonb_array_elements_text(coalesce(p_row -> 'samePerson', '[]'::jsonb)) with ordinality as t(x, ord)
  where x::uuid <> rid;
end
$$;

-- Rows that name this row as the same person (the other side of a link stored elsewhere).
create or replace function public.api_same_person_of(p_row uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(distinct l.source_row_id), '[]'::jsonb)
  from public.row_links l
  join public.rows r on r.id = l.source_row_id
  join public.sheets s on s.id = r.sheet_id
  where l.kind = 'same_person' and l.target_row_id = p_row
    and r.deleted_at is null and s.deleted_at is null
$$;

-- api_save_row, now saving same-person links too.
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

revoke execute on function public.ua_save_same_person(jsonb) from public, anon;
revoke execute on function public.api_same_person_of(uuid) from public, anon;
grant execute on function public.ua_save_same_person(jsonb) to authenticated, service_role;
grant execute on function public.api_same_person_of(uuid) to authenticated, service_role;
