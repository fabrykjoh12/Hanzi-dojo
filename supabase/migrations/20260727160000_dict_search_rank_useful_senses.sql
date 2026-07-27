-- dict_search ranked exact-match candidates only by length, so for a word with
-- several CC-CEDICT entries the one a reader actually wants often lost to a
-- proper noun or a cross-reference stub:
--
--   墙   → "variant of 牆|墙[qiang2]"        (wanted: "wall")
--   白云 → "see 白雲區|白云区[Bai2 yun2 Qu1]" (wanted: "white cloud")
--   熊   → "surname Xiong"                    (wanted: "bear")
--   狮子 → "Leo (star sign)"                  (wanted: "lion")
--   云   → "surname Yun"                      (wanted: "cloud")
--
-- That matters now that the story reader resolves out-of-pool words through
-- this dictionary: a learner taps an unknown word mid-story and gets a Guangzhou
-- district instead of a definition.
--
-- Fix: demote entries whose FIRST definition is a surname, a "variant of" /
-- "old variant of" stub, or a bare "see X" cross-reference, and entries whose
-- pinyin is capitalized (CC-CEDICT's marker for a proper noun — it is what
-- separates 狮子 "Shī zǐ" = Leo from 狮子 "shī zi" = lion, which are otherwise
-- identical rows and were tie-broken arbitrarily). They are real entries and
-- stay searchable, they just stop outranking the ordinary sense. Everything
-- else about the ordering is unchanged.
--
-- ⚠️ This cannot rescue a sense that was never ingested. seed-dict.mjs dedupes
-- on (simplified, pinyin), which collapses distinct CC-CEDICT entries that
-- differ only in their traditional form — so 墙/牆 "wall" was dropped as a
-- duplicate of 墙/墻 "variant of", and 云/雲 "cloud" lost to 云/云 "(classical)
-- to say". Those two still show the wrong gloss after this migration. The real
-- fix is a re-seed keyed on (simplified, traditional, pinyin).
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
    -- Demote low-information senses (false sorts first, so useful senses win).
    (
      e.definitions->>0 ilike 'surname %'
      or e.definitions->>0 ilike 'variant of %'
      or e.definitions->>0 ilike 'old variant of %'
      or e.definitions->>0 ilike 'see %'
      or e.pinyin ~ '^[A-Z]'                                              -- proper noun
    ) asc,
    char_length(e.simplified) asc,                                        -- shorter first
    e.simplified asc
  limit greatest(1, least(p_limit, 100));
$function$;
