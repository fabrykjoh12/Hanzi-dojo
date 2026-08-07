-- In-app account deletion (PRE-RELEASE-CHECKLIST §0b).
-- Both app stores require a self-serve, in-app account deletion flow
-- (App Store 5.1.1(v); Google Play account-deletion policy). Clients cannot
-- delete auth users, so this security-definer RPC does the whole thing in one
-- transaction: every row the account owns, then the auth user itself.
--
-- Schema facts this is built on (verified in prod 2026-08-07):
--   * public.profiles has NO foreign key to auth.users, so deleting the auth
--     user would orphan the profile — the profile is deleted explicitly here.
--   * 12 tables cascade from profiles (cards, daily_activity, feedback,
--     grammar_reviews, language_tracks, level_unlocks, push_subscriptions,
--     review_logs, story_reads, test_answers, test_attempts, writing_stats).
--   * unlocked_stories, analytics_events and bodyos_app_state carry a user_id
--     with no FK at all — deleted explicitly, guarded by to_regclass so a
--     database without one of them (or a future rename) can never abort the
--     deletion (same pattern as the reset RPC's writing_stats guard).
--   * dojo_* rows (the internal admin board) are deliberately NOT deleted:
--     they are shared team work-tracking content, not learner data. If an
--     admin account is ever deleted its board items simply remain.
--   * Deleting auth.users cascades inside the auth schema (identities,
--     sessions, refresh tokens), so every login for the account dies with it.
--
-- Deletion is total and permanent by design — this is the "delete your
-- account and everything in it" promise on /privacy, made real.
--
-- Idempotent: create or replace + re-runnable grants.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  -- User-keyed tables with no FK chain to profiles.
  if to_regclass('public.unlocked_stories') is not null then
    delete from public.unlocked_stories where user_id = uid;
  end if;
  if to_regclass('public.analytics_events') is not null then
    delete from public.analytics_events where user_id = uid;
  end if;
  if to_regclass('public.bodyos_app_state') is not null then
    delete from public.bodyos_app_state where user_id = uid;
  end if;

  -- The profile row; its ON DELETE CASCADE takes every owned learning row.
  delete from public.profiles where id = uid;

  -- The account itself; auth-schema cascades kill sessions and identities.
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
revoke all on function public.delete_my_account() from anon;
grant execute on function public.delete_my_account() to authenticated;
