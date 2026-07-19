-- supabase/migrations/20260719120000_add_reference_dictionary.sql
-- Pleco-style reference dictionary (Chinese). Two read-only reference tables,
-- decoupled from the curriculum `vocabulary` table, plus security-definer search
-- RPCs. Mirrors the data-minimization + RLS conventions of
-- 20260718150000_add_public_assessment_vocab.sql.

create extension if not exists pg_trgm;

-- ~120k CC-CEDICT headwords.
create table if not exists public.dict_entries (
  id uuid primary key default gen_random_uuid(),
  language text not null default 'chinese' check (language in ('chinese')),
  simplified text not null,
  traditional text not null,
  pinyin text not null,             -- tone-marked, e.g. 'zhōng wén'
  pinyin_plain text not null,       -- toneless, lowercased, for search
  definitions jsonb not null,       -- array of sense strings
  hsk_level int,                    -- denormalized convenience; source of truth stays vocabulary
  created_at timestamptz not null default now()
);

-- Tatoeba Chinese↔English sentence pairs.
create table if not exists public.dict_examples (
  id uuid primary key default gen_random_uuid(),
  language text not null default 'chinese' check (language in ('chinese')),
  hanzi text not null,
  pinyin text,
  english text not null,
  created_at timestamptz not null default now()
);

-- Search indexes.
create index if not exists dict_entries_simp_trgm on public.dict_entries using gin (simplified gin_trgm_ops);
create index if not exists dict_entries_trad_trgm on public.dict_entries using gin (traditional gin_trgm_ops);
create index if not exists dict_entries_pinyin_trgm on public.dict_entries using gin (pinyin_plain gin_trgm_ops);
create index if not exists dict_entries_defs_trgm on public.dict_entries using gin ((definitions::text) gin_trgm_ops);
create index if not exists dict_entries_simp_eq on public.dict_entries (simplified);
create index if not exists dict_examples_hanzi_trgm on public.dict_examples using gin (hanzi gin_trgm_ops);

-- RLS: authenticated read-only, matching the vocabulary policy stance.
alter table public.dict_entries enable row level security;
alter table public.dict_examples enable row level security;
create policy "authenticated can read dict_entries" on public.dict_entries for select to authenticated using (true);
create policy "authenticated can read dict_examples" on public.dict_examples for select to authenticated using (true);

-- Ranked search: exact simplified/traditional > prefix > pinyin_plain prefix >
-- contains (hanzi / pinyin / english). Case/tone folding for pinyin & english is
-- done on the client (lower + strip marks) before the call; we lower() here too
-- for english so the two meet.
create or replace function public.dict_search(p_query text, p_limit int default 60)
returns setof public.dict_entries
language sql
stable
security definer
set search_path = public
as $$
  select e.*
  from public.dict_entries e
  where p_query <> '' and (
    e.simplified ilike '%' || p_query || '%'
    or e.traditional ilike '%' || p_query || '%'
    or e.pinyin_plain ilike '%' || p_query || '%'
    or (definitions::text) ilike '%' || p_query || '%'
  )
  order by
    (e.simplified = p_query or e.traditional = p_query) desc,             -- exact hanzi
    (e.pinyin_plain = p_query) desc,                                      -- exact toneless pinyin
    (e.simplified ilike p_query || '%' or e.pinyin_plain ilike p_query || '%') desc, -- prefix
    char_length(e.simplified) asc,                                        -- shorter first
    e.simplified asc
  limit greatest(1, least(p_limit, 100));
$$;

create or replace function public.dict_entry(p_id uuid)
returns public.dict_entries
language sql
stable
security definer
set search_path = public
as $$
  select * from public.dict_entries where id = p_id;
$$;

create or replace function public.dict_examples_for(p_word text, p_limit int default 4)
returns table (hanzi text, pinyin text, english text)
language sql
stable
security definer
set search_path = public
as $$
  select x.hanzi, x.pinyin, x.english
  from public.dict_examples x
  where p_word <> '' and x.hanzi like '%' || p_word || '%'
  order by char_length(x.hanzi) asc
  limit greatest(1, least(p_limit, 10));
$$;

create or replace function public.dict_words_containing(p_word text, p_id uuid, p_limit int default 12)
returns table (id uuid, simplified text, pinyin text, definitions jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.simplified, e.pinyin, e.definitions
  from public.dict_entries e
  where p_word <> ''
    and e.simplified like '%' || p_word || '%'
    and e.id <> p_id
  order by char_length(e.simplified) asc, e.simplified asc
  limit greatest(1, least(p_limit, 30));
$$;

revoke all on function public.dict_search(text, int) from public;
revoke all on function public.dict_entry(uuid) from public;
revoke all on function public.dict_examples_for(text, int) from public;
revoke all on function public.dict_words_containing(text, uuid, int) from public;
grant execute on function public.dict_search(text, int) to authenticated;
grant execute on function public.dict_entry(uuid) to authenticated;
grant execute on function public.dict_examples_for(text, int) to authenticated;
grant execute on function public.dict_words_containing(text, uuid, int) to authenticated;

notify pgrst, 'reload schema';
