-- Ownership (CLAUDE.md §2.14): every active member reads everything that is not in someone
-- else's Trash; only the owner writes. Enforced here, in the repositories through can(), and in
-- the UI. pgTAP tests in supabase/tests/ prove that another member is refused.

-- ---------- Visibility helpers (security definer: they read past RLS, they decide nothing) ----

-- A sheet is visible to everyone while it is not in Trash.
create or replace function public.ua_sheet_live(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.sheets s where s.id = target and s.deleted_at is null)
$$;

-- A row is visible to everyone while neither it nor its sheet is in Trash.
create or replace function public.ua_row_live(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rows r
    join public.sheets s on s.id = r.sheet_id
    where r.id = target and r.deleted_at is null and s.deleted_at is null
  )
$$;

-- ---------- Sign-up gate: only listed, active members get a user ----------

create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.members m
    where m.active and lower(m.email) = lower(coalesce(event -> 'user' ->> 'email', ''))
  ) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'error', jsonb_build_object(
      'message', 'This account is not on the UA team. Ask an admin to add you.',
      'http_code', 403
    )
  );
end
$$;

-- ---------- Owner assignment for tables without a parent ----------

create trigger sheets_owner before insert on public.sheets
  for each row execute function public.ua_owner_is_actor();

-- ---------- Members: admins add, deactivate and reactivate; nobody edits their own rights ----

create or replace function public.ua_guard_member_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actor uuid := public.current_member_id();
  admin boolean := public.current_member_is_admin();
begin
  -- The service role (seeding, the CLI) has no member and is not restricted here.
  if actor is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if not admin then
      raise exception 'Only an admin can add a member' using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;
  if new.id = actor and (new.is_admin is distinct from old.is_admin or new.active is distinct from old.active) then
    raise exception 'You cannot change your own admin or active status' using errcode = 'insufficient_privilege';
  end if;
  if not admin and (
    new.id <> actor
    or new.email is distinct from old.email
    or new.slug is distinct from old.slug
    or new.position is distinct from old.position
  ) then
    raise exception 'Only an admin can change a member' using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

create trigger members_guard before insert or update on public.members
  for each row execute function public.ua_guard_member_change();

-- ---------- Tags: one shared vocabulary; only the creator renames, recolours or deletes ----------

-- The members (other than the actor) whose rows use a tag, by name.
create or replace function public.ua_tag_other_users(target uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select string_agg(distinct m.name, ', ' order by m.name)
  from public.row_tags rt
  join public.members m on m.id = rt.owner_id
  where rt.tag_id = target and rt.owner_id is distinct from public.current_member_id()
$$;

create or replace function public.ua_guard_tag_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actor uuid := public.current_member_id();
  others text;
begin
  if actor is not null then
    if old.created_by is distinct from actor then
      raise exception 'Only the member who created this tag can change it'
        using errcode = 'insufficient_privilege';
    end if;
    others := public.ua_tag_other_users(old.id);
    if others is not null then
      raise exception 'This tag is used on rows of %', others
        using errcode = 'insufficient_privilege', hint = 'tag_in_use';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create trigger tags_guard before update or delete on public.tags
  for each row execute function public.ua_guard_tag_change();

-- ---------- Row level security ----------

alter table public.members enable row level security;
alter table public.sheets enable row level security;
alter table public.columns enable row level security;
alter table public.stages enable row level security;
alter table public.rows enable row level security;
alter table public.tags enable row level security;
alter table public.row_tags enable row level security;
alter table public.history enable row level security;
alter table public.row_links enable row level security;
alter table public.files enable row level security;
alter table public.not_duplicate_pairs enable row level security;

-- Members: every member sees the team, including deactivated members (their tab stays visible).
create policy members_select on public.members for select to authenticated
  using ((select public.current_member_id()) is not null);
create policy members_insert on public.members for insert to authenticated
  with check ((select public.current_member_is_admin()));
create policy members_update on public.members for update to authenticated
  using (id = (select public.current_member_id()) or (select public.current_member_is_admin()))
  with check (id = (select public.current_member_id()) or (select public.current_member_is_admin()));

-- Sheets.
create policy sheets_select on public.sheets for select to authenticated
  using (
    (select public.current_member_id()) is not null
    and (deleted_at is null or owner_id = (select public.current_member_id()))
  );
create policy sheets_insert on public.sheets for insert to authenticated
  with check (owner_id = (select public.current_member_id()));
create policy sheets_update on public.sheets for update to authenticated
  using (owner_id = (select public.current_member_id()))
  with check (owner_id = (select public.current_member_id()));
create policy sheets_delete on public.sheets for delete to authenticated
  using (owner_id = (select public.current_member_id()));

-- Columns.
create policy columns_select on public.columns for select to authenticated
  using (
    (select public.current_member_id()) is not null
    and (
      owner_id = (select public.current_member_id())
      or (deleted_at is null and public.ua_sheet_live(sheet_id))
    )
  );
create policy columns_insert on public.columns for insert to authenticated
  with check (owner_id = (select public.current_member_id()));
create policy columns_update on public.columns for update to authenticated
  using (owner_id = (select public.current_member_id()))
  with check (owner_id = (select public.current_member_id()));
create policy columns_delete on public.columns for delete to authenticated
  using (owner_id = (select public.current_member_id()));

-- Stages.
create policy stages_select on public.stages for select to authenticated
  using (
    (select public.current_member_id()) is not null
    and (owner_id = (select public.current_member_id()) or public.ua_sheet_live(sheet_id))
  );
create policy stages_insert on public.stages for insert to authenticated
  with check (owner_id = (select public.current_member_id()));
create policy stages_update on public.stages for update to authenticated
  using (owner_id = (select public.current_member_id()))
  with check (owner_id = (select public.current_member_id()));
create policy stages_delete on public.stages for delete to authenticated
  using (owner_id = (select public.current_member_id()));

-- Rows.
create policy rows_select on public.rows for select to authenticated
  using (
    (select public.current_member_id()) is not null
    and (
      owner_id = (select public.current_member_id())
      or (deleted_at is null and public.ua_sheet_live(sheet_id))
    )
  );
create policy rows_insert on public.rows for insert to authenticated
  with check (owner_id = (select public.current_member_id()));
create policy rows_update on public.rows for update to authenticated
  using (owner_id = (select public.current_member_id()))
  with check (owner_id = (select public.current_member_id()));
create policy rows_delete on public.rows for delete to authenticated
  using (owner_id = (select public.current_member_id()));

-- Tags: anyone on the team reads and creates; change and delete pass the guard trigger above.
create policy tags_select on public.tags for select to authenticated
  using ((select public.current_member_id()) is not null);
create policy tags_insert on public.tags for insert to authenticated
  with check ((select public.current_member_id()) is not null);
create policy tags_update on public.tags for update to authenticated
  using ((select public.current_member_id()) is not null)
  with check ((select public.current_member_id()) is not null);
create policy tags_delete on public.tags for delete to authenticated
  using ((select public.current_member_id()) is not null);

-- Row tags, history, links and files follow the row they hang off.
create policy row_tags_select on public.row_tags for select to authenticated
  using (
    (select public.current_member_id()) is not null
    and (owner_id = (select public.current_member_id()) or public.ua_row_live(row_id))
  );
create policy row_tags_insert on public.row_tags for insert to authenticated
  with check (owner_id = (select public.current_member_id()));
create policy row_tags_delete on public.row_tags for delete to authenticated
  using (owner_id = (select public.current_member_id()));

create policy history_select on public.history for select to authenticated
  using (
    (select public.current_member_id()) is not null
    and (owner_id = (select public.current_member_id()) or public.ua_row_live(row_id))
  );
create policy history_insert on public.history for insert to authenticated
  with check (owner_id = (select public.current_member_id()));
create policy history_update on public.history for update to authenticated
  using (owner_id = (select public.current_member_id()))
  with check (owner_id = (select public.current_member_id()));
create policy history_delete on public.history for delete to authenticated
  using (owner_id = (select public.current_member_id()));

create policy row_links_select on public.row_links for select to authenticated
  using (
    (select public.current_member_id()) is not null
    and (owner_id = (select public.current_member_id()) or public.ua_row_live(source_row_id))
  );
create policy row_links_insert on public.row_links for insert to authenticated
  with check (owner_id = (select public.current_member_id()));
create policy row_links_update on public.row_links for update to authenticated
  using (owner_id = (select public.current_member_id()))
  with check (owner_id = (select public.current_member_id()));
create policy row_links_delete on public.row_links for delete to authenticated
  using (owner_id = (select public.current_member_id()));

create policy files_select on public.files for select to authenticated
  using (
    (select public.current_member_id()) is not null
    and (owner_id = (select public.current_member_id()) or public.ua_row_live(row_id))
  );
create policy files_insert on public.files for insert to authenticated
  with check (owner_id = (select public.current_member_id()));
create policy files_update on public.files for update to authenticated
  using (owner_id = (select public.current_member_id()))
  with check (owner_id = (select public.current_member_id()));
create policy files_delete on public.files for delete to authenticated
  using (owner_id = (select public.current_member_id()));

-- "Different person" choices are private to the member who made them.
create policy not_duplicate_pairs_select on public.not_duplicate_pairs for select to authenticated
  using (owner_id = (select public.current_member_id()));
create policy not_duplicate_pairs_insert on public.not_duplicate_pairs for insert to authenticated
  with check (owner_id = (select public.current_member_id()));
create policy not_duplicate_pairs_delete on public.not_duplicate_pairs for delete to authenticated
  using (owner_id = (select public.current_member_id()));

-- The anonymous role reads and calls nothing. Functions are callable by signed-in users and the
-- service only (PostgREST would otherwise expose them to anyone as RPC); the sign-up hook only
-- by the auth service.
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;

-- ---------- Storage: files live under <owner member id>/<row id>/<file id> ----------

insert into storage.buckets (id, name, public, file_size_limit)
values ('row-files', 'row-files', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create policy row_files_select on storage.objects for select to authenticated
  using (bucket_id = 'row-files' and (select public.current_member_id()) is not null);
create policy row_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'row-files'
    and (storage.foldername(name))[1] = (select public.current_member_id())::text
  );
create policy row_files_update on storage.objects for update to authenticated
  using (
    bucket_id = 'row-files'
    and (storage.foldername(name))[1] = (select public.current_member_id())::text
  )
  with check (
    bucket_id = 'row-files'
    and (storage.foldername(name))[1] = (select public.current_member_id())::text
  );
create policy row_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'row-files'
    and (storage.foldername(name))[1] = (select public.current_member_id())::text
  );

-- ---------- Realtime: other members' changes appear live ----------

alter publication supabase_realtime add table
  public.members, public.sheets, public.columns, public.stages, public.rows, public.tags,
  public.row_tags, public.history, public.row_links, public.files;
