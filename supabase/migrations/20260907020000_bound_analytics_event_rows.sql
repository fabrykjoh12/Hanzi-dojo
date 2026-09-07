-- FAB-26 finding 5 — anonymous inserts into public.analytics_events.
--
-- NOT APPLIED. Committed first, per CLAUDE.md §8. Idempotent; safe to re-run.
--
-- WHAT THE FINDING IS, AND WHAT IT IS NOT.
--
-- The insert policy is `with check (user_id is null or auth.uid() = user_id)`.
-- Cross-user forgery is correctly blocked: RLS compares against auth.uid(), so
-- no caller can write a row attributed to somebody else's account. What is open
-- is the `user_id is null` limb — anyone holding the publishable key, which
-- ships in every store build by design, can append rows with no account.
--
-- THAT LIMB CANNOT BE CLOSED, and the honest thing to do is say so rather than
-- ship a policy that looks like it closed it. The limb exists because the top
-- of the funnel is measured before an account exists — landing_viewed,
-- prelogin_*, taste_*, signup_started. Requiring auth.uid() would delete the
-- pre-signup funnel outright.
--
-- Nor is it only the pre-signup names. Measured live, 23 distinct event names
-- have arrived with user_id null, including onboarding_completed, tutorial_*
-- and assessment_* — events fired by SIGNED-IN clients during the window
-- between authentication and setAnalyticsContext() supplying the user id. So a
-- name allowlist for the anonymous limb is not available either: it would have
-- to contain nearly every name, and the ones it excluded would be dropped in
-- silence, because analytics inserts swallow every outcome by design
-- (src/analytics.js — "analytics must never break the app").
--
-- WHAT THIS MIGRATION DOES INSTEAD. Two things, both bounded and neither
-- pretending to be the fix that is not available:
--
--   1. Caps what ONE row can cost. Today `props` is an unconstrained jsonb and
--      `name` an unconstrained text, so a single insert can carry megabytes.
--      After this, a row is bounded to roughly 2.5 KB. The volume itself stays
--      open — an attacker rotating session ids cannot be rate-limited from
--      inside RLS, and a per-session cap would only be security theatre
--      (session_id is client-generated; rotating it is free). Bounding volume
--      belongs at the edge (Supabase rate limiting) or in a retention prune,
--      neither of which is a migration; docs/BACKLOG.md records both.
--
--   2. Stops an anonymous row being dated into the future. `created_at` is
--      supplied by the client — deliberately, because the offline outbox
--      replays events recorded earlier — so an inserter can date rows years
--      ahead and poison every range the dashboard has not reached yet. The
--      past stays open, since that is the legitimate offline case; the future
--      does not.
--
-- WHY THE FUTURE BOUND IS IN THE POLICY AND NOT A CHECK CONSTRAINT. A CHECK
-- constraint may only call IMMUTABLE functions, and now() is STABLE. Putting it
-- in the constraint would fail at DDL time. RLS policy expressions have no such
-- restriction.
--
-- MEASURED AGAINST PRODUCTION BEFORE WRITING, so none of this refuses a row the
-- app actually sends. Over all 6,157 live rows: longest name 25 chars, longest
-- session_id 36 (a uuid), longest language 8, longest app_version 7, largest
-- props 157 characters across at most 8 keys. Zero rows have a null session_id,
-- zero are dated in the future, zero carry a non-object props, and zero have a
-- level outside 0–20. Every bound below therefore validates against existing
-- data — this migration cannot fail on the current table.

-- ── 1. Bound what one row can carry ─────────────────────────────────────────
-- Dropped first so re-running the migration re-establishes the current
-- definition rather than erroring on a constraint that already exists.

alter table public.analytics_events
  drop constraint if exists analytics_events_name_bounded,
  drop constraint if exists analytics_events_session_id_bounded,
  drop constraint if exists analytics_events_language_bounded,
  drop constraint if exists analytics_events_app_version_bounded,
  drop constraint if exists analytics_events_level_bounded,
  drop constraint if exists analytics_events_props_bounded;

alter table public.analytics_events
  -- Longest real name is 25 characters; every name comes from the EVENTS map
  -- in src/analytics.js. An empty name is meaningless to every aggregate.
  add constraint analytics_events_name_bounded
    check (char_length(name) between 1 and 64),

  -- A uuid is 36. The non-crypto fallback in getSessionId() is shorter.
  add constraint analytics_events_session_id_bounded
    check (session_id is null or char_length(session_id) between 1 and 64),

  -- 'chinese' | 'japanese' | 'russian' | null.
  add constraint analytics_events_language_bounded
    check (language is null or char_length(language) between 1 and 32),

  -- A short build sha.
  add constraint analytics_events_app_version_bounded
    check (app_version is null or char_length(app_version) between 1 and 64),

  -- Level systems here run 1–9; the bound is loose on purpose, since its job is
  -- to stop an absurd integer being used as a grouping key, not to duplicate
  -- the level systems in docs/ARCHITECTURE.md.
  add constraint analytics_events_level_bounded
    check (level is null or (level >= 0 and level <= 1000)),

  -- The one that matters. sanitizeProps() already keeps props to numbers,
  -- booleans and strings of at most 40 characters; the largest row in
  -- production is 157 characters. 2 KB is thirteen times the real maximum and
  -- still bounds a hostile insert. jsonb_typeof pins it to an object, because
  -- every reader (admin_client_errors, the duration_ms aggregate) indexes it
  -- by key and a top-level array or scalar would simply read as null.
  add constraint analytics_events_props_bounded
    check (jsonb_typeof(props) = 'object' and char_length(props::text) <= 2048);

-- ── 2. Reinstate the insert policy with two added clauses ───────────────────
-- The first clause is unchanged and is the one that blocks cross-user forgery.
-- Restated in full rather than altered, so this file shows the whole policy
-- that ends up in the database.

drop policy if exists "analytics insert own or anon" on public.analytics_events;
create policy "analytics insert own or anon"
  on public.analytics_events
  for insert
  with check (
    -- Unchanged: an account may only write rows attributed to itself, and the
    -- anonymous limb stays open because the pre-signup funnel depends on it.
    (user_id is null or auth.uid() = user_id)

    -- An anonymous row with no session_id has no actor at all — docs/METRICS.md
    -- defines the actor as the account when signed in and the session_id
    -- otherwise — so it is uncountable by construction and can only ever
    -- inflate a row count. track() always supplies one (getSessionId() cannot
    -- return null), so this refuses nothing the app sends.
    and (user_id is not null or session_id is not null)

    -- created_at is client-supplied so the offline outbox can replay an event
    -- with the time it actually happened. The past therefore stays open. A day
    -- of slack absorbs a device whose clock is wrong; beyond that, an event
    -- claiming to have happened in the future is not a replay.
    and created_at <= now() + interval '1 day'
  );

notify pgrst, 'reload schema';
