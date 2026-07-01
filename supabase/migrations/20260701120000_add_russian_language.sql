-- Add Russian as a third language.
--
-- Relax the language/system CHECK constraints across every table that carries
-- them so language='russian' and system='russian' become valid. Russian uses a
-- CEFR-style level system (levels 1–6 → A1…C2); the existing "between 1 and 9"
-- level checks already cover 1–6, so they are left unchanged.
--
-- RLS parity: none of the row-level-security policies are language-scoped —
-- shared content tables (vocabulary/stories/story_vocab/youtube_recommendations)
-- grant authenticated SELECT with `using (true)`, and per-user tables key off
-- user_id — so Russian rows are automatically covered by the same policies as
-- Chinese/Japanese. We re-assert `enable row level security` (idempotent) on the
-- shared content tables below to make that parity explicit and guard against a
-- table having been created with RLS off.

-- profiles.active_language
alter table public.profiles drop constraint if exists profiles_active_language_check;
alter table public.profiles add constraint profiles_active_language_check
  check (active_language in ('chinese', 'japanese', 'russian'));

-- language_tracks.language / .system
alter table public.language_tracks drop constraint if exists language_tracks_language_check;
alter table public.language_tracks add constraint language_tracks_language_check
  check (language in ('chinese', 'japanese', 'russian'));
alter table public.language_tracks drop constraint if exists language_tracks_system_check;
alter table public.language_tracks add constraint language_tracks_system_check
  check (system in ('hsk_3', 'jlpt', 'russian', 'custom'));

-- vocabulary.language / .system
alter table public.vocabulary drop constraint if exists vocabulary_language_check;
alter table public.vocabulary add constraint vocabulary_language_check
  check (language in ('chinese', 'japanese', 'russian'));
alter table public.vocabulary drop constraint if exists vocabulary_system_check;
alter table public.vocabulary add constraint vocabulary_system_check
  check (system in ('hsk_3', 'jlpt', 'russian', 'custom'));

-- test_attempts.language / .system
alter table public.test_attempts drop constraint if exists test_attempts_language_check;
alter table public.test_attempts add constraint test_attempts_language_check
  check (language in ('chinese', 'japanese', 'russian'));
alter table public.test_attempts drop constraint if exists test_attempts_system_check;
alter table public.test_attempts add constraint test_attempts_system_check
  check (system in ('hsk_3', 'jlpt', 'russian', 'custom'));

-- level_unlocks.language / .system
alter table public.level_unlocks drop constraint if exists level_unlocks_language_check;
alter table public.level_unlocks add constraint level_unlocks_language_check
  check (language in ('chinese', 'japanese', 'russian'));
alter table public.level_unlocks drop constraint if exists level_unlocks_system_check;
alter table public.level_unlocks add constraint level_unlocks_system_check
  check (system in ('hsk_3', 'jlpt', 'russian', 'custom'));

-- stories.language / .system
alter table public.stories drop constraint if exists stories_language_check;
alter table public.stories add constraint stories_language_check
  check (language in ('chinese', 'japanese', 'russian'));
alter table public.stories drop constraint if exists stories_system_check;
alter table public.stories add constraint stories_system_check
  check (system in ('hsk_3', 'jlpt', 'russian', 'custom'));

-- youtube_recommendations.language / .system
alter table public.youtube_recommendations drop constraint if exists youtube_recommendations_language_check;
alter table public.youtube_recommendations add constraint youtube_recommendations_language_check
  check (language in ('chinese', 'japanese', 'russian'));
alter table public.youtube_recommendations drop constraint if exists youtube_recommendations_system_check;
alter table public.youtube_recommendations add constraint youtube_recommendations_system_check
  check (system in ('hsk_3', 'jlpt', 'russian', 'custom'));

-- RLS parity (idempotent): shared read-only content tables keep RLS on, so the
-- existing "authenticated users can read …" policies apply to Russian rows too.
alter table public.vocabulary enable row level security;
alter table public.stories enable row level security;
alter table public.story_vocab enable row level security;
alter table public.youtube_recommendations enable row level security;
