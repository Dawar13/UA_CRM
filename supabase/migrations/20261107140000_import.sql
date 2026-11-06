-- Importing rows in one transaction: each item is { row, history (the "created" entry), extra
-- (imported touches) }. Runs as the caller, so the same row-level security applies.
create or replace function public.api_import_rows(p_items jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  item jsonb;
  results jsonb := '[]'::jsonb;
begin
  for item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    perform public.api_save_row(item -> 'row', item -> 'history');
    if jsonb_typeof(item -> 'extra') = 'array' and jsonb_array_length(item -> 'extra') > 0 then
      perform public.api_add_history((item -> 'row' ->> 'id')::uuid, item -> 'extra');
    end if;
    results := results || jsonb_build_array(
      (select public.ua_row_json(r) from public.rows r where r.id = (item -> 'row' ->> 'id')::uuid)
    );
  end loop;
  return results;
end
$$;

revoke execute on function public.api_import_rows(jsonb) from public, anon;
grant execute on function public.api_import_rows(jsonb) to authenticated, service_role;
