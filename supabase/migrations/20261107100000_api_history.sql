-- Who is signed in, and history in the domain's shape.

-- The signed-in user's membership, active or not (a deactivated member is told so, not treated
-- as a stranger). Null for someone who is not on the team.
create or replace function public.api_me()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.ua_member_json(m)
  from public.members m
  where lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1
$$;

-- A row's history, newest first.
create or replace function public.api_list_history(p_row uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.ua_history_json(h) order by h.at desc, h.created_at desc, h.id), '[]'::jsonb)
  from public.history h
  where h.row_id = p_row
$$;

-- History of every live row one member owns, in [p_from, p_to), oldest first.
create or replace function public.api_member_history(p_member uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.ua_history_json(h) order by h.at, h.id), '[]'::jsonb)
  from public.history h
  join public.rows r on r.id = h.row_id
  join public.sheets s on s.id = r.sheet_id
  where r.owner_id = p_member and r.deleted_at is null and s.deleted_at is null
    and h.at >= p_from and h.at < p_to
$$;

revoke execute on function public.api_me() from public, anon;
revoke execute on function public.api_list_history(uuid) from public, anon;
revoke execute on function public.api_member_history(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.api_me() to authenticated, service_role;
grant execute on function public.api_list_history(uuid) to authenticated, service_role;
grant execute on function public.api_member_history(uuid, timestamptz, timestamptz) to authenticated, service_role;
