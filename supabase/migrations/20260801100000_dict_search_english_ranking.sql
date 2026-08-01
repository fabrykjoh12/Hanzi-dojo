-- English queries ranked common-word-first. Idempotent (create or replace).
--
-- dict_search('friend') returned 义, 交, 任, 俦 … with 朋友 nowhere in the top
-- rows. Cause: for an English query nothing matches the hanzi/pinyin keys, so
-- after the junk demotion the order fell straight to char_length(simplified) —
-- i.e. "shortest hanzi first" — and every single-character entry whose long
-- CC-CEDICT gloss merely contains "friend" outranked the word a learner means.
--
-- The ordering now scores HOW the definitions match before any length tie-break:
--   1. a definition item that IS the query ("friend")
--   2. a definition item that starts with it ("friends", "friend (of)"),
--      including the verb form ("to friend")
--   3. syllabus words first (hsk_level asc, nulls last) — the common-learner-
--      word boost; it also improves hanzi-substring browsing
-- (No regex over the raw query: user input isn't a safe regex.)
-- Exact-hanzi / exact-pinyin / prefix keys stay on top unchanged, so Chinese
-- and pinyin lookups behave exactly as before.
--
-- The low-information demotion also now covers explicitly vulgar/offensive
-- senses, so slang can never outrank the everyday word (a UI-level default
-- filter with deliberate reveal is still to come — this is ranking only).

create or replace function public.dict_search(p_query text, p_limit integer default 60)
returns setof public.dict_entries
language sql
stable
security definer
set search_path to 'public'
as $function$
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
    -- Demote low-information and offensive senses (false sorts first).
    (
      e.definitions->>0 ilike 'surname %'
      or e.definitions->>0 ilike 'variant of %'
      or e.definitions->>0 ilike 'old variant of %'
      or e.definitions->>0 ilike 'see %'
      or e.pinyin ~ '^[A-Z]'                                              -- proper noun
      or (definitions::text) ilike '%(vulgar)%'
      or (definitions::text) ilike '%(coarse)%'
      or (definitions::text) ilike '%(offensive)%'
    ) asc,
    -- A definition item that IS the query — the entry that MEANS this word.
    exists (
      select 1 from jsonb_array_elements_text(e.definitions) d
      where lower(btrim(d)) = lower(btrim(p_query))
    ) desc,
    -- A definition item that starts with it (plurals, parentheticals, "to …").
    exists (
      select 1 from jsonb_array_elements_text(e.definitions) d
      where d ilike btrim(p_query) || '%' or d ilike 'to ' || btrim(p_query) || '%'
    ) desc,
    e.hsk_level asc nulls last,                                           -- syllabus first
    char_length(e.simplified) asc,                                        -- shorter first
    e.simplified asc
  limit greatest(1, least(p_limit, 100));
$function$;
