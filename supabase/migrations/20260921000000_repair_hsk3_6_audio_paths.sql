-- supabase/migrations/20260921000000_repair_hsk3_6_audio_paths.sql
--
-- HSK 3-6 vocabulary audio is unreachable in production: 4,491 of the 4,498
-- active words carry an `audio_path` pointing at an object that does not exist.
-- Measured live 2026-09-21; only 7 of the 4,498 resolve.
--
-- WHAT HAPPENED, and why this is a re-point rather than a regeneration. The
-- recordings ARE in the bucket -- 1,871 of them across level_3..level_6 -- but
-- under the LEVEL DIRECTORY and INDEX of an older word list. `audio_path` is
-- written as `level_<current level>/<current sort_order>_<slug>.mp3`, so once
-- the vocabulary was re-seeded and re-levelled (docs/VOCAB-INGESTION.md), every
-- path pointed at a name nothing had ever written. The directories say it
-- plainly: level_3 holds 457 files and only 72 of them belong to a word that is
-- at level 3 today.
--
-- WHY IT IS WORSE THAN SILENCE. `src/Listen.jsx:19` builds its question pool
-- from `pool.filter(v => v.audio_path)` -- a NON-NULL test, not a reachable
-- one -- so the listening exercise keeps serving HSK 3-6 words and then plays
-- nothing. `src/ttsAudio.js:105` falls back to this same column for every level
-- with no `tts_audio` row, which is all of 3-6 (HSK 1 and 2 have rows; 3-6 have
-- 25 between them).
--
-- WHAT THIS REPAIRS, AND WHAT IT DELIBERATELY DOES NOT.
--
--   1,168 words are re-pointed. Every one of them is matched on the pinyin slug
--   embedded in the filename, and ONLY where that slug is unique on BOTH sides:
--   exactly one file in the whole `chinese/hsk_3` tree carries it, and exactly
--   one ACTIVE word in the whole course does. That double-uniqueness is the
--   entire safety argument, and it is why this is not simply "match by pinyin":
--   Chinese is full of homophones, and attaching another word's recording to a
--   card is worse than attaching none -- a learner cannot tell it is wrong, and
--   the flashcard actively teaches the error.
--
--   796 words have a candidate file whose slug is shared (by another file, or
--   by another word). They are LEFT ALONE. Picking one would be a coin flip
--   with a learner's pronunciation on the other side. Resolving them needs the
--   word->file mapping from the original generation run, which is not in this
--   repository, or regeneration.
--
--   2,502 words have no candidate file at all and need a real TTS run. That
--   spends money and is not a migration.
--
-- Requiring the CURRENT path to be dead is what makes this idempotent and what
-- keeps it from touching a word whose audio already works: after it runs the
-- repaired rows resolve, so a second run matches nothing. It also means the
-- migration can never take a working clip away from a word.
--
-- Levels 1 and 2 are out of scope as targets -- all 497 of their words already
-- resolve -- but their FILES are in the candidate pool, because the re-levelling
-- moved words in both directions and 52 of level_1's files belong to words that
-- now sit elsewhere. Their words are still counted in the uniqueness test, so a
-- level-5 word can never be given the clip a level-1 homophone is using.

update public.vocabulary v
set audio_path = f.name
from (
  select slug, min(name) as name
  from (
    select name,
           regexp_replace(
             regexp_replace(split_part(name, '/', 4), '^[0-9]+_', ''),
             '\.mp3$', ''
           ) as slug
    from storage.objects
    where bucket_id = 'audio'
      and name like 'chinese/hsk_3/level_%'
  ) files
  group by slug
  having count(*) = 1
) f
join (
  select slug, (array_agg(id))[1] as id
  from (
    select id,
           replace(replace(lower(reading_plain), ' ', ''), '''', '') as slug
    from public.vocabulary
    where language = 'chinese'
      and system = 'hsk_3'
      and is_active
      and reading_plain is not null
      and reading_plain <> ''
  ) w
  group by slug
  having count(*) = 1
) u on u.slug = f.slug
where v.id = u.id
  and v.language = 'chinese'
  and v.system = 'hsk_3'
  and v.is_active
  and v.level between 3 and 6
  and not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'audio' and o.name = v.audio_path
  );
