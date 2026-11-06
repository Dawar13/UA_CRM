-- The duplicate check (CLAUDE.md §2.7): candidate rows from every tab, found by the identity
-- keys and by name similarity. The app's scorer (src/domain/dedupe) makes the final call; this
-- only narrows thousands of rows to a handful. Pairs the caller marked "different person" for
-- p_self are left out.
create or replace function public.api_dedupe_candidates(
  p_name text,
  p_phone text default null,
  p_email text default null,
  p_linkedin text default null,
  p_company text default null,
  p_self uuid default null
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with q as (
    select
      public.ua_normalise_name(coalesce(p_name, '')) as name_key,
      replace(public.ua_normalise_name(coalesce(p_name, '')), ' ', '') as compact_key,
      split_part(public.ua_normalise_name(coalesce(p_name, '')), ' ', 1) as first_name,
      public.ua_phone_key(coalesce(p_phone, '')) as phone_key,
      public.ua_normalise_email(coalesce(p_email, '')) as email_key,
      public.ua_linkedin_slug(coalesce(p_linkedin, '')) as linkedin_key,
      public.ua_normalise_company(coalesce(p_company, '')) as company_key
  ),
  hits as (
    select r.*
    from public.rows r
    join public.sheets s on s.id = r.sheet_id, q
    where r.deleted_at is null and s.deleted_at is null
      and (p_self is null or r.id <> p_self)
      and (
        (q.phone_key is not null and r.phone_key = q.phone_key)
        or (q.email_key is not null and r.email_key = q.email_key)
        or (q.linkedin_key is not null and r.linkedin_key = q.linkedin_key)
        or (q.name_key <> '' and r.name_compact_key = q.compact_key)
        or (q.name_key <> '' and extensions.similarity(r.name_key, q.name_key) >= 0.4)
        or (q.company_key <> '' and r.company_key = q.company_key
            and split_part(r.name_key, ' ', 1) = q.first_name)
      )
      and not exists (
        select 1 from public.not_duplicate_pairs p
        where p_self is not null
          and p.row_a = least(p_self, r.id) and p.row_b = greatest(p_self, r.id)
      )
    limit 50
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'row', public.ua_row_json(h), 'sheet', public.ua_sheet_json(s), 'member', public.ua_member_json(m)
  )), '[]'::jsonb)
  from hits h
  join public.sheets s on s.id = h.sheet_id
  join public.members m on m.id = h.owner_id
$$;

-- Pairs the caller has marked "different person", as "a|b" keys.
create or replace function public.api_not_duplicate_keys()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(p.row_a::text || '|' || p.row_b::text), '[]'::jsonb)
  from public.not_duplicate_pairs p
  where p.owner_id = public.current_member_id()
$$;

revoke execute on function public.api_dedupe_candidates(text, text, text, text, text, uuid) from public, anon;
revoke execute on function public.api_not_duplicate_keys() from public, anon;
grant execute on function public.api_dedupe_candidates(text, text, text, text, text, uuid) to authenticated, service_role;
grant execute on function public.api_not_duplicate_keys() to authenticated, service_role;
