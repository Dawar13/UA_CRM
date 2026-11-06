-- Every row of a sheet, Trash included, for the owner's sheet-wide changes (stage edits and
-- column type changes keep trashed rows consistent too). Others see only live rows, as always.
create or replace function public.api_sheet_rows_all(p_sheet uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.ua_row_json(r) order by r.position, r.created_at), '[]'::jsonb)
  from public.rows r
  where r.sheet_id = p_sheet
$$;

revoke execute on function public.api_sheet_rows_all(uuid) from public, anon;
grant execute on function public.api_sheet_rows_all(uuid) to authenticated, service_role;
