-- Extensions and helper functions used by the schema and its policies.
-- Identity normalisers mirror src/domain/identity.ts (normaliseEmail, linkedinSlug, normaliseName,
-- normaliseCompany). The domain stays the source of truth: the parity test in
-- tests/integration/identity-parity.test.ts checks these against it.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- unaccent is stable, not immutable; pinning the dictionary makes this wrapper safe to use in
-- generated columns and indexes.
create or replace function public.ua_unaccent(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(value, ''))
$$;

-- Letter and number runs, lowercased and without accents.
create or replace function public.ua_word_runs(value text)
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    array(
      select m[1]
      from regexp_matches(lower(public.ua_unaccent(value)), '([[:alnum:]]+)', 'g') as m
    ),
    '{}'
  )
$$;

-- "Prof. Dr A Kumar" → "a kumar": leading titles dropped, but never every word.
create or replace function public.ua_normalise_name(value text)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  words text[] := public.ua_word_runs(value);
  titles text[] := array['mr', 'ms', 'mrs', 'dr', 'cdr', 'capt', 'col', 'prof', 'shri', 'smt', 'er'];
  start int := 1;
begin
  while start < coalesce(array_length(words, 1), 0) and words[start] = any(titles) loop
    start := start + 1;
  end loop;
  return array_to_string(words[start:], ' ');
end
$$;

-- "Hosur Precision Forge Pvt. Ltd." → "hosur precision forge"; "&" becomes "and".
create or replace function public.ua_normalise_company(value text)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  words text[] := public.ua_word_runs(replace(coalesce(value, ''), '&', ' and '));
  suffixes text[] := array[
    'private limited', 'private ltd', 'pvt limited', 'pvt ltd', 'p ltd',
    'limited', 'ltd', 'pvt', 'llp', 'incorporated', 'inc', 'llc'
  ];
  suffix text;
  parts text[];
  n int;
  stripped boolean := true;
begin
  while stripped loop
    stripped := false;
    foreach suffix in array suffixes loop
      parts := string_to_array(suffix, ' ');
      n := array_length(parts, 1);
      if coalesce(array_length(words, 1), 0) > n
        and words[array_length(words, 1) - n + 1:] = parts then
        words := words[1:array_length(words, 1) - n];
        stripped := true;
        exit;
      end if;
    end loop;
  end loop;
  return array_to_string(words, ' ');
end
$$;

create or replace function public.ua_normalise_email(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when lower(regexp_replace(trim(coalesce(value, '')), '^mailto:', '', 'i')) ~ '^[^\s@]+@[^\s@]+\.[^\s@.]+$'
      then lower(regexp_replace(trim(coalesce(value, '')), '^mailto:', '', 'i'))
  end
$$;

-- LinkedIn slug from a profile URL, "in/slug" or a bare slug; null otherwise.
create or replace function public.ua_linkedin_slug(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(lower(trim(coalesce(
    substring(trim(coalesce(value, '')) from '(?i)linkedin\.com/(?:in|pub)/([^/?#[:space:]]+)'),
    substring(trim(coalesce(value, '')) from '(?i)^/?in/([^/?#[:space:]]+)/?$'),
    substring(trim(coalesce(value, '')) from '^@?([[:alnum:]][[:alnum:]_-]{1,99})$')
  ))), '')
$$;

-- Phones are stored in E.164 by the client (domain normalisePhone); anything else has no key.
create or replace function public.ua_phone_key(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case when coalesce(value, '') ~ '^\+[1-9][0-9]{6,14}$' then value end
$$;

-- updated_at on every write.
create or replace function public.ua_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;
