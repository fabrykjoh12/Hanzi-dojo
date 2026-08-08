-- Anonymous visitors may read READY tts_audio rows.
--
-- Why: the pre-signup first lesson (FirstLesson.jsx) plays 你好 before any
-- account exists, and it should play the Azure neural clip the flashcards
-- use — not the legacy recording. The clip files live in the PUBLIC `audio`
-- bucket already; this table only tells the client which content-hashed path
-- to fetch, so the policy reveals nothing the bucket does not. Scope matches
-- the existing authenticated policy exactly: status = 'ready' only — pending
-- and failed rows stay invisible, and there is no anon write path.
--
-- Idempotent: drop-then-create, safe to re-run.

drop policy if exists "anon can read ready tts_audio" on public.tts_audio;

create policy "anon can read ready tts_audio"
  on public.tts_audio
  for select
  to anon
  using (status = 'ready');
