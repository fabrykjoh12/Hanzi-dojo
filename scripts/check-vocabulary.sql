-- Diagnostic: what vocabulary does the live database actually serve?
--
-- Run this in the Supabase SQL editor for the project the DEPLOYED app is
-- pointed at (the one behind VITE_SUPABASE_URL, not necessarily the one you
-- develop against). It answers the question onboarding cares about: "does
-- language X / system Y have any *active* levels?"
--
-- Onboarding (src/Onboarding.jsx) shows "Content for <language> is coming soon"
-- whenever this query returns zero rows for the picked language + system. If the
-- flagship (chinese / hsk_3) is empty here, the app is behaving correctly — the
-- data is missing from THIS project. Common causes:
--   * VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY point at a fresh/empty project
--   * content was seeded into a different project than the one deployed
--   * the rows exist but were flipped to is_active = false

-- 1) Active level coverage per language/system — this is exactly what onboarding reads.
select language, system, level, count(*) as active_words
from public.vocabulary
where is_active = true
group by language, system, level
order by language, system, level;

-- 2) The flagship, isolated. Expect HSK 1 (~300) and HSK 2 (~198) per Claude.md §7.
select level, count(*) as active_words
from public.vocabulary
where language = 'chinese' and system = 'hsk_3' and is_active = true
group by level
order by level;

-- 3) Are there Chinese rows that exist but are INACTIVE? (would explain an empty
--    onboarding while the words are technically present in the table).
select is_active, count(*)
from public.vocabulary
where language = 'chinese' and system = 'hsk_3'
group by is_active;

-- 4) Sanity: total rows in the table. Zero here means the wrong/empty project.
select count(*) as total_vocabulary_rows from public.vocabulary;

-- ── Repair, if section 3 shows Chinese rows exist but is_active = false ──
-- Review first, then uncomment to re-activate (never deletes anything):
--
-- update public.vocabulary
--   set is_active = true
--   where language = 'chinese' and system = 'hsk_3' and is_active = false;
