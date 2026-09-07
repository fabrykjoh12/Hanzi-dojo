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
-- WHO KEEPS FULL ACCESS, and the correction that needed making. The first
-- draft said "the admin audio tooling is unaffected" because `admins can read
-- all tts_audio` is a separate, untouched policy. True of tts_audio — and only
-- of tts_audio. story_utterances and story_questions had NO admin policy, so
-- after the scoping above their only remaining policy would be published-only,
-- and the admin review surface ROADMAP.md plans for generated audio could not
-- read the utterance rows behind an unpublished story's clips: exactly the
-- content it exists to review. Both now get the same admin escape the repo
-- already uses for tts_audio (20260722140000).
--
--   * src/tts/** runs from root .mjs scripts under the SERVICE key, which
--     bypasses RLS entirely — the generation pipeline still sees everything.
--
-- VOCABULARY AUDIO IS UNTOUCHED, and the escape is a whitelist. `source_type =
-- 'vocabulary'` passes unchanged, so the anonymous public surface keeps the
-- pronunciation it needs. The first draft wrote `source_type <>
-- 'story_utterance'`, which is exactly equivalent today — the column is NOT
-- NULL with `check (source_type in ('vocabulary','story_utterance'))`
-- (20260722140000) — and fails OPEN tomorrow: a third source_type would arrive
-- anonymously readable by default. Naming what is allowed fails closed, which
-- is the same argument this file makes for itself everywhere else.
--
-- ONE SIBLING IS DELIBERATELY LEFT ALONE. `tts_pronunciation_overrides` is also
-- `authenticated ... using (true)` and its `source_text` holds "the context the
-- correction came from" (20260722140000), which for a story-derived pin is
-- unpublished story text. It is the same class of leak, it is outside the two
-- findings this change closes, and scoping it needs a source_id join that table
-- does not have — so it is recorded in docs/BACKLOG.md rather than half-fixed
-- here. This migration's title is about the three tables named above, not about
-- every table that touches a story.
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

-- Admins see every row, published or not — the same shape as
-- `admins can read all tts_audio`, so the review surfaces keep working.
drop policy if exists "admins can read all story utterances" on public.story_utterances;
create policy "admins can read all story utterances"
  on public.story_utterances for select to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

drop policy if exists "admins can read all story questions" on public.story_questions;
create policy "admins can read all story questions"
  on public.story_questions for select to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
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
      source_type = 'vocabulary'
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
      source_type = 'vocabulary'
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
