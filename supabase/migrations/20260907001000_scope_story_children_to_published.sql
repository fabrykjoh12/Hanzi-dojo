-- supabase/migrations/20260907001000_scope_story_children_to_published.sql
-- Stop unpublished story text leaking through the tables that hang off it.
--
-- WHY. `stories` is correctly scoped — `authenticated users can read published
-- stories` is `USING (is_published = true)`. Three sibling tables never joined
-- back to it:
--
--   story_utterances  authenticated, USING (true)   115 utterances of
--                                                   unpublished stories
--   story_questions   authenticated, USING (true)   45 questions, INCLUDING
--                                                   correct_index
--   tts_audio         anon,          status='ready' 230 rows whose source_text
--                                                   is unpublished-story text
--
-- Counts measured live; 33 of 295 stories are unpublished.
--
-- The tts_audio row is the sharp one. That policy makes the text of unreleased
-- chapters readable by an UNAUTHENTICATED caller holding the publishable key —
-- which ships in every store build by design. `source_text` and
-- `normalized_text` are the utterance's own words.
--
-- This is an embargo boundary, not a privacy one: no personal data is exposed,
-- and no learner can reach another learner's rows. It is still a leak of
-- unreleased content, and it is live.
--
-- WHY THIS DOES NOT BREAK THE READER. Every client read of story_utterances and
-- story_questions is `.eq('story_id', story.id)` where `story` came from a
-- query that already filtered `is_published = true`
-- (useStoryReaderCore.js, StoryReaderImmersive.jsx) — so no client flow can
-- reach an unpublished story's children today anyway: the `stories` policy
-- already stopped it one step earlier. This closes the direct path that
-- bypassed that step.
--
-- Two readers deliberately keep full access:
--   * `admins can read all tts_audio` is a separate policy and is untouched,
--     so the admin audio tooling is unaffected.
--   * src/tts/** runs from root .mjs scripts under the SERVICE key, which
--     bypasses RLS entirely — the generation pipeline still sees everything.
--
-- vocabulary audio is untouched. Scoping is applied only to rows whose
-- source_type is 'story_utterance'; `source_type <> 'story_utterance'` passes
-- unchanged, so the anonymous public surface keeps the vocabulary pronunciation
-- it needs.
--
-- Idempotent: drop policy if exists, then create.

-- ── story_utterances ────────────────────────────────────────────────────────
drop policy if exists "authenticated can read story utterances" on public.story_utterances;
create policy "authenticated can read story utterances"
  on public.story_utterances for select to authenticated
  using (
    exists (
      select 1 from public.stories s
      where s.id = story_utterances.story_id
        and s.is_published
    )
  );

-- ── story_questions ─────────────────────────────────────────────────────────
drop policy if exists "authenticated users can read story questions" on public.story_questions;
create policy "authenticated users can read story questions"
  on public.story_questions for select to authenticated
  using (
    exists (
      select 1 from public.stories s
      where s.id = story_questions.story_id
        and s.is_published
    )
  );

-- ── tts_audio ───────────────────────────────────────────────────────────────
-- Both client policies, because the authenticated one has the same hole; only
-- the anonymous one is worse.
drop policy if exists "anon can read ready tts_audio" on public.tts_audio;
create policy "anon can read ready tts_audio"
  on public.tts_audio for select to anon
  using (
    status = 'ready'
    and (
      source_type <> 'story_utterance'
      or exists (
        select 1
        from public.story_utterances u
        join public.stories s on s.id = u.story_id
        where u.id = tts_audio.source_id
          and s.is_published
      )
    )
  );

drop policy if exists "authenticated can read ready tts_audio" on public.tts_audio;
create policy "authenticated can read ready tts_audio"
  on public.tts_audio for select to authenticated
  using (
    status = 'ready'
    and (
      source_type <> 'story_utterance'
      or exists (
        select 1
        from public.story_utterances u
        join public.stories s on s.id = u.story_id
        where u.id = tts_audio.source_id
          and s.is_published
      )
    )
  );

notify pgrst, 'reload schema';
