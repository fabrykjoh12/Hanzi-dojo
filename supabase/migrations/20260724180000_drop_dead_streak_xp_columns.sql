-- supabase/migrations/20260724180000_drop_dead_streak_xp_columns.sql
-- Clean-up follow-up to the 2026-07-22 "streak & XP system removal" (see
-- docs/BACKLOG.md). That change deleted the mechanic — src/xp.js, src/xpService.js,
-- the account-level badge, the streak/freeze stat cards, the streak+level
-- achievement groups, the dev streak/XP actions — but deliberately left the
-- backing `profiles` columns in place. This migration drops the ones that are
-- provably dead, and ONLY those.
--
-- Dropping a column destroys its data irreversibly, so each one below was
-- verified individually before being listed. What was searched, for all four
-- candidate columns:
--   * src/**                    (all .js/.jsx, including every `from('profiles')`
--                                call site and every `select('*')` consumer)
--   * root *.mjs content/ops scripts (incl. send-review-reminders.mjs)
--   * .github/workflows/**
--   * supabase/schema.sql, every file in supabase/migrations/, and the BODIES of
--     the security-definer functions — grade_card, reset_current_language_progress,
--     dict_add_to_deck, public_story, admin_overview/funnel/active_users/
--     retention/story_stats, guard_is_admin. A column used inside a function body
--     is invisible to a JS-only grep, so the SQL was searched separately.
--   * tests/** (unit + e2e + fixtures)

-- ── DROPPED ──────────────────────────────────────────────────────────────────
--
-- total_xp — added by 20260630000000_add_xp_and_prefs.sql. Zero readers and zero
-- writers remain: no src/ file names it (the XP writers lived in the deleted
-- src/xp.js / src/xpService.js), no script or workflow names it, and no SQL
-- function body touches it. The only remaining mentions in the repo are the
-- migration that created it, prose in CLAUDE.md/docs, and the test fixture noted
-- below. NOTE: `writing_stats.xp` and `writing_stats.correct_streak` are a
-- DIFFERENT table, still live in src/Writing.jsx, and are untouched here.
alter table public.profiles drop column if exists total_xp;

-- longest_streak — listed in the backlog item, but it appears in NO migration and
-- NOT in supabase/schema.sql, so on a schema built from this repo it does not
-- exist at all (it may exist in prod from an ad-hoc change). Nothing anywhere
-- reads or writes it. `if exists` makes this a no-op either way.
alter table public.profiles drop column if exists longest_streak;

-- ── DELIBERATELY KEPT — DO NOT ADD THESE TO THE LIST ─────────────────────────
--
-- streak, streak_freezes: STILL REFERENCED IN SQL. The security-definer function
-- public.reset_current_language_progress(text, text, boolean) — current body in
-- 20260702120000_add_story_reads.sql, mirrored in supabase/schema.sql — ends with
--
--     if p_reset_streak then
--       delete from public.daily_activity where user_id = v_user_id;
--       update public.profiles
--       set streak = 0, streak_freezes = 1, last_studied_on = null
--       where id = v_user_id;
--     end if;
--
-- and p_reset_streak DEFAULTS TO TRUE. That branch is on a live user-facing path:
-- src/Profile.jsx's "reset my progress" calls the RPC without p_reset_streak (so
-- the default applies), and src/Dev.jsx's FULL reset passes p_reset_streak: true.
-- Dropping either column would make every progress reset fail at runtime with
-- "column streak of relation profiles does not exist" — the plpgsql body is
-- resolved at execution time, so nothing would warn us at migration time.
--
-- To retire them later, first ship a migration that `create or replace`s
-- reset_current_language_progress with the two `set` clauses removed (keeping the
-- daily_activity delete and the last_studied_on reset, which the calm "gentle
-- return" welcome in src/gentleReturn.js still depends on), update
-- supabase/schema.sql to match, and only then drop the columns.

-- ── NOT a consumer ───────────────────────────────────────────────────────────
-- tests/fixtures/mockSupabase.js's PROFILE fixture carries streak_freezes,
-- total_xp, current_streak and longest_streak. That is a hand-written mock
-- response object, not a query against the real database — no test asserts on
-- those fields, and two of them (current_streak) never even existed as columns.
-- It was left untouched on purpose and does not block this drop.

notify pgrst, 'reload schema';
