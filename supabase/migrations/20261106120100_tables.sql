-- Tables mirroring src/domain/schemas.ts. Every owned table carries owner_id (the member whose
-- tab it belongs to), set by trigger from its parent so a client cannot choose it. Audit columns
-- are set by trigger from the signed-in member. Soft delete (deleted_at) on sheets, columns and
-- rows.

-- ---------- Members ----------

create table public.members (
  id uuid primary key default gen_random_uuid(),
  -- The Google (or, in local and staging tests, email) identity. Matched case-insensitively.
  email text not null,
  name text not null check (length(trim(name)) > 0),
  slug text not null check (slug ~ '^[a-z0-9-]+$'),
  position int not null default 0 check (position >= 0),
  is_admin boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.members (id),
  updated_by uuid references public.members (id)
);
create unique index members_email_key on public.members (lower(email));
create unique index members_slug_key on public.members (slug);

-- The signed-in user's active membership, or null. Security definer so policies can call it
-- without recursing through the members policies.
create or replace function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
  from public.members m
  where m.active
    and lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1
$$;

create or replace function public.current_member_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select m.is_admin from public.members m where m.id = public.current_member_id()),
    false
  )
$$;

-- created_by / updated_by always name the signed-in member; never trusted from the client.
create or replace function public.ua_set_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actor uuid := public.current_member_id();
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := coalesce(actor, new.created_by);
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(actor, new.updated_by);
  return new;
end
$$;

create trigger members_audit before insert or update on public.members
  for each row execute function public.ua_set_audit();

-- ---------- Sheets, columns, stages ----------

create table public.sheets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.members (id),
  slug text not null check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (length(trim(name)) > 0),
  template text not null
    check (template in ('customers', 'investors', 'advisors', 'connectors', 'serviceProviders', 'blank')),
  position int not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.members (id),
  updated_by uuid references public.members (id),
  deleted_at timestamptz
);
create unique index sheets_owner_slug_key on public.sheets (owner_id, slug) where deleted_at is null;
create index sheets_owner_idx on public.sheets (owner_id, position);

create table public.columns (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references public.sheets (id) on delete cascade,
  owner_id uuid not null references public.members (id),
  key text not null check (length(key) > 0),
  label text not null check (length(trim(label)) > 0),
  type text not null check (type in (
    'text', 'longText', 'number', 'currency', 'date', 'dropdown', 'multiSelect', 'personLink',
    'url', 'phone', 'email', 'checkbox', 'files', 'warmth', 'stage', 'tags', 'lastTouch',
    'nextAction'
  )),
  system boolean not null default false,
  options text[],
  width int not null check (width > 0),
  hidden boolean not null default false,
  position int not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.members (id),
  updated_by uuid references public.members (id),
  deleted_at timestamptz
);
create unique index columns_sheet_key on public.columns (sheet_id, key) where deleted_at is null;
create index columns_sheet_idx on public.columns (sheet_id, position);

create table public.stages (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references public.sheets (id) on delete cascade,
  owner_id uuid not null references public.members (id),
  name text not null check (length(trim(name)) > 0),
  position int not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.members (id),
  updated_by uuid references public.members (id)
);
create index stages_sheet_idx on public.stages (sheet_id, position);

-- ---------- Rows ----------

create table public.rows (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references public.sheets (id),
  owner_id uuid not null references public.members (id),
  position int not null default 0 check (position >= 0),
  name text not null check (length(trim(name)) > 0),
  company text not null default '',
  title text not null default '',
  phone text not null default '',
  email text not null default '',
  linkedin text not null default '',
  links text[] not null default '{}',
  warmth text check (warmth in ('warm', 'waiting', 'cold')),
  stage_index int check (stage_index >= 0),
  -- { "<stage id>": "2026-11-05" | null }: null means skipped, a missing key means not reached.
  stage_dates jsonb not null default '{}'::jsonb,
  lost_stage_index int check (lost_stage_index >= 0),
  lost_date date,
  next_text text,
  next_date date,
  next_precision text check (next_precision in ('day', 'early-month', 'mid-month', 'late-month', 'month')),
  notes text not null default '',
  -- Custom per-sheet fields, keyed by column key.
  fields jsonb not null default '{}'::jsonb,
  -- The most recent history instant; maintained by trigger, never written by the client.
  last_touch_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.members (id),
  updated_by uuid references public.members (id),
  deleted_at timestamptz,
  -- Identity keys for the duplicate check (mirroring src/domain/identity.ts).
  phone_key text generated always as (public.ua_phone_key(phone)) stored,
  email_key text generated always as (public.ua_normalise_email(email)) stored,
  linkedin_key text generated always as (public.ua_linkedin_slug(linkedin)) stored,
  name_key text generated always as (public.ua_normalise_name(name)) stored,
  name_compact_key text generated always as (replace(public.ua_normalise_name(name), ' ', '')) stored,
  company_key text generated always as (public.ua_normalise_company(company)) stored,
  constraint rows_lost_complete check ((lost_stage_index is null) = (lost_date is null)),
  constraint rows_next_date_complete check ((next_date is null) = (next_precision is null))
);
create index rows_sheet_idx on public.rows (sheet_id, position) where deleted_at is null;
create index rows_owner_idx on public.rows (owner_id);
create index rows_phone_key_idx on public.rows (phone_key) where phone_key is not null;
create index rows_email_key_idx on public.rows (email_key) where email_key is not null;
create index rows_linkedin_key_idx on public.rows (linkedin_key) where linkedin_key is not null;
create index rows_name_trgm_idx on public.rows using gin (name_key extensions.gin_trgm_ops);
create index rows_company_trgm_idx on public.rows using gin (company_key extensions.gin_trgm_ops);

-- ---------- Tags ----------

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  colour text not null
    check (colour in ('indigo', 'violet', 'pink', 'orange', 'amber', 'lime', 'teal', 'slate')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The creator: the only member who may rename, recolour or delete it (see tag functions).
  created_by uuid references public.members (id),
  updated_by uuid references public.members (id)
);
create unique index tags_name_key on public.tags (lower(name));

create table public.row_tags (
  row_id uuid not null references public.rows (id) on delete cascade,
  -- Deleting a tag removes it from the creator's rows; the guard refuses while others use it.
  tag_id uuid not null references public.tags (id) on delete cascade,
  owner_id uuid not null references public.members (id),
  created_at timestamptz not null default now(),
  primary key (row_id, tag_id)
);
create index row_tags_tag_idx on public.row_tags (tag_id, owner_id);

-- ---------- History ----------

create table public.history (
  id uuid primary key default gen_random_uuid(),
  row_id uuid not null references public.rows (id) on delete cascade,
  owner_id uuid not null references public.members (id),
  kind text not null check (kind in (
    'note', 'call', 'meeting', 'whatsapp', 'email', 'stage', 'warmth', 'created', 'imported'
  )),
  source text not null check (source in ('manual', 'calendar', 'system')),
  at timestamptz not null,
  fuzzy_date date,
  fuzzy_precision text check (fuzzy_precision in ('day', 'early-month', 'mid-month', 'late-month', 'month')),
  text text not null default '',
  -- The member who made the change or logged the touch.
  member_id uuid not null references public.members (id),
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.members (id),
  updated_by uuid references public.members (id),
  constraint history_fuzzy_complete check ((fuzzy_date is null) = (fuzzy_precision is null))
);
create index history_row_at_idx on public.history (row_id, at desc);
create index history_owner_at_idx on public.history (owner_id, at);

-- ---------- Links (stored on the source row's side) ----------

create table public.row_links (
  id uuid primary key default gen_random_uuid(),
  source_row_id uuid not null references public.rows (id) on delete cascade,
  owner_id uuid not null references public.members (id),
  kind text not null check (kind in ('introduced_by', 'connects_to', 'same_person')),
  target_row_id uuid references public.rows (id) on delete set null,
  target_text text,
  position int not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.members (id),
  updated_by uuid references public.members (id),
  constraint row_links_one_target check ((target_row_id is null) <> (target_text is null))
);
create index row_links_source_idx on public.row_links (source_row_id, kind, position);
create index row_links_target_idx on public.row_links (target_row_id) where target_row_id is not null;

-- ---------- Files (Supabase Storage objects attached to rows) ----------

create table public.files (
  id uuid primary key default gen_random_uuid(),
  row_id uuid not null references public.rows (id) on delete cascade,
  owner_id uuid not null references public.members (id),
  name text not null,
  size bigint not null check (size >= 0 and size <= 10485760),
  mime_type text not null default 'application/octet-stream',
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.members (id),
  updated_by uuid references public.members (id)
);
create index files_row_idx on public.files (row_id);

-- ---------- Pairs a member marked as different people ----------

create table public.not_duplicate_pairs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.members (id),
  row_a uuid not null references public.rows (id) on delete cascade,
  row_b uuid not null references public.rows (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint not_duplicate_pairs_ordered check (row_a < row_b)
);
create unique index not_duplicate_pairs_key on public.not_duplicate_pairs (owner_id, row_a, row_b);

-- ---------- Ownership triggers: owner_id always comes from the parent ----------

create or replace function public.ua_owner_from_sheet()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select s.owner_id into new.owner_id from public.sheets s where s.id = new.sheet_id;
  if new.owner_id is null then
    raise exception 'Sheet % does not exist', new.sheet_id using errcode = 'foreign_key_violation';
  end if;
  return new;
end
$$;

create or replace function public.ua_owner_from_row()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- row_links names its parent source_row_id; every other child table names it row_id.
  parent uuid := coalesce(to_jsonb(new) ->> 'source_row_id', to_jsonb(new) ->> 'row_id')::uuid;
begin
  select r.owner_id into new.owner_id from public.rows r where r.id = parent;
  if new.owner_id is null then
    raise exception 'Row % does not exist', parent using errcode = 'foreign_key_violation';
  end if;
  return new;
end
$$;

create or replace function public.ua_owner_is_actor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.owner_id := coalesce(public.current_member_id(), new.owner_id);
  return new;
end
$$;

create trigger columns_owner before insert or update of sheet_id on public.columns
  for each row execute function public.ua_owner_from_sheet();
create trigger stages_owner before insert or update of sheet_id on public.stages
  for each row execute function public.ua_owner_from_sheet();
create trigger rows_owner before insert or update of sheet_id on public.rows
  for each row execute function public.ua_owner_from_sheet();
create trigger row_tags_owner before insert on public.row_tags
  for each row execute function public.ua_owner_from_row();
create trigger history_owner before insert or update of row_id on public.history
  for each row execute function public.ua_owner_from_row();
create trigger row_links_owner before insert or update of source_row_id on public.row_links
  for each row execute function public.ua_owner_from_row();
create trigger files_owner before insert or update of row_id on public.files
  for each row execute function public.ua_owner_from_row();
create trigger not_duplicate_pairs_owner before insert on public.not_duplicate_pairs
  for each row execute function public.ua_owner_is_actor();

-- Audit columns on every table that has them.
create trigger sheets_audit before insert or update on public.sheets
  for each row execute function public.ua_set_audit();
create trigger columns_audit before insert or update on public.columns
  for each row execute function public.ua_set_audit();
create trigger stages_audit before insert or update on public.stages
  for each row execute function public.ua_set_audit();
create trigger rows_audit before insert or update on public.rows
  for each row execute function public.ua_set_audit();
create trigger tags_audit before insert or update on public.tags
  for each row execute function public.ua_set_audit();
create trigger history_audit before insert or update on public.history
  for each row execute function public.ua_set_audit();
create trigger row_links_audit before insert or update on public.row_links
  for each row execute function public.ua_set_audit();
create trigger files_audit before insert or update on public.files
  for each row execute function public.ua_set_audit();

-- ---------- Last touch: the newest history instant, kept by trigger ----------

create or replace function public.ua_refresh_last_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := coalesce(new.row_id, old.row_id);
begin
  update public.rows r
  set last_touch_at = (select max(h.at) from public.history h where h.row_id = target)
  where r.id = target;
  if tg_op = 'UPDATE' and old.row_id is distinct from new.row_id then
    update public.rows r
    set last_touch_at = (select max(h.at) from public.history h where h.row_id = old.row_id)
    where r.id = old.row_id;
  end if;
  return null;
end
$$;

create trigger history_last_touch after insert or update or delete on public.history
  for each row execute function public.ua_refresh_last_touch();

-- A history entry names the member who logged it; never trusted from the client.
create or replace function public.ua_history_member()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.member_id := coalesce(public.current_member_id(), new.member_id);
  return new;
end
$$;

create trigger history_member before insert on public.history
  for each row execute function public.ua_history_member();

-- The client never writes last_touch_at: a new row starts with none, and a client update keeps
-- the stored value. Only the history trigger above (one level deeper) changes it.
create or replace function public.ua_protect_last_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.last_touch_at := null;
  else
    new.last_touch_at := old.last_touch_at;
  end if;
  return new;
end
$$;

create trigger rows_protect_last_touch before insert or update on public.rows
  for each row execute function public.ua_protect_last_touch();
