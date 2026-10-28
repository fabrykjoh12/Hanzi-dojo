-- supabase/migrations/20261028090000_null_unreachable_audio_paths.sql
-- Stop words claiming audio they do not have (FAB-64).
--
-- WHY. `vocabulary.audio_path` is read as "this word can be played" by every
-- screen that touches it: Listen and Tones build questions from it, prefetch
-- warms it, Speaking, the chat missions and the story reader try it before
-- falling back to the device's own speech. Measured 2026-10-28, 3,323 active
-- Chinese words — all of them HSK 3-6 — carry a path naming an object that does
-- not exist in the `audio` bucket. 20260921000000 re-pointed the 1,168 whose
-- recording could be matched without doubt; these are the rest: 796 whose only
-- candidate clip shares its pinyin with another word (deliberately not guessed
-- at) and 2,502 that were never recorded. Per level: L3 383, L4 636, L5 995,
-- L6 1,309. HSK 1-2: none.
--
-- So Listen and Tones played silence and marked the learner wrong, and the
-- screens with a speech fallback never used it, because a non-null path looked
-- playable and the fallback only runs on an empty one or an error.
--
-- WHAT. Null exactly those paths, so "non-null" means "a file exists" again,
-- everywhere at once, without touching a call site. A word that later gets a
-- recording gets it through tts_audio (tts-generate.mjs, the only generator
-- still run for HSK 3-6), which never reads this column, so nothing here is in
-- the way of FAB-66.
--
-- The one generator that DOES read this column, generate-audio.mjs, uploads to
-- the stored path and skips a null one. It is run only for HSK 1-2
-- (regen-content.yml; its HSK 3-6 task is retired), where nothing is nulled.
--
-- REVERSIBLE. Every value is copied to vocabulary_unreachable_audio_path before
-- it is cleared, so the old state is one UPDATE ... FROM away. Nothing else
-- reads that table; it is not exposed to the client.
--
-- NOT TOUCHED. Words whose path resolves, and every word outside Chinese. Only
-- rows whose path names nothing are written, which is also what makes this
-- idempotent: after one run the predicate matches no row, so a second run
-- inserts nothing and nulls nothing.
--
-- The integrity gate's `no-audio` count is unchanged by this: it already
-- required the file to exist (vocabularyIntegrity.mjs), so these words were
-- counted as silent before and still are. The new hard check
-- `audio-path-resolves` is what keeps a dead path from coming back.

create table if not exists public.vocabulary_unreachable_audio_path (
  vocab_id   uuid primary key references public.vocabulary(id) on delete cascade,
  audio_path text not null,
  nulled_at  timestamptz not null default now()
);

alter table public.vocabulary_unreachable_audio_path enable row level security;
revoke all on table public.vocabulary_unreachable_audio_path from anon, authenticated;

insert into public.vocabulary_unreachable_audio_path (vocab_id, audio_path)
select v.id, v.audio_path
from public.vocabulary v
where v.language = 'chinese'
  and v.audio_path is not null
  and not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'audio' and o.name = v.audio_path
  )
on conflict (vocab_id) do nothing;

update public.vocabulary v
set audio_path = null
where v.language = 'chinese'
  and v.audio_path is not null
  and not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'audio' and o.name = v.audio_path
  );
