-- Per-language progress reset.
--
-- The old reset was ALREADY scoped to a language for the study data it deleted
-- — cards, review_logs, writing_stats, story_reads, test_attempts and
-- level_unlocks were all filtered by p_language + p_system. Three things made
-- it behave like an account reset anyway:
--
--   1. daily_activity has NO language column (its key is user_id + date), and
--      streak / streak_freezes / last_studied_on live on profiles. The old body
--      cleared all four whenever p_reset_streak was true — and it DEFAULTED to
--      true, while src/Profile.jsx called the function without passing it. So
--      the user-facing "Reset progress" button always wiped every language's
--      study history and the account streak as collateral.
--   2. language_tracks.current_level was never touched. A reset account sat at
--      (say) HSK 4 with no unlocks and no cards — a state the app cannot reach
--      by any normal path. The repo's own /reset helper hands out raw SQL that
--      sets current_level = 1, which is the tell that the in-app reset was
--      incomplete.
--   3. The track lookup required is_active = true, so you could only ever reset
--      the language you were currently studying. Clearing a second language
--      meant switching to it first.
--
-- This adds reset_language_progress, which fixes all three, and keeps
-- reset_current_language_progress as a thin delegating wrapper so any client
-- still running the previous bundle during a deploy keeps working unchanged.

create or replace function public.reset_language_progress(
  p_language text,
  p_system text,
  -- Account-wide, so it is opt-in. See note 1 above: there is no way to clear
  -- study history for one language, because the table does not record one.
  p_reset_account_history boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_has_track boolean;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Any track the account owns, active or not.
  select exists (
    select 1
    from public.language_tracks
    where user_id = v_user_id
      and language = p_language
      and system = p_system
  )
  into v_has_track;

  if not v_has_track then
    raise exception 'Language track not found';
  end if;

  delete from public.review_logs rl
  using public.vocabulary v
  where rl.user_id = v_user_id
    and rl.vocab_id = v.id
    and v.language = p_language
    and v.system = p_system;

  delete from public.cards c
  using public.vocabulary v
  where c.user_id = v_user_id
    and c.vocab_id = v.id
    and v.language = p_language
    and v.system = p_system;

  delete from public.writing_stats ws
  using public.vocabulary v
  where ws.user_id = v_user_id
    and ws.vocab_id = v.id
    and v.language = p_language
    and v.system = p_system;

  delete from public.story_reads sr
  using public.stories s
  where sr.user_id = v_user_id
    and sr.story_id = s.id
    and s.language = p_language
    and s.system = p_system;

  delete from public.test_attempts
  where user_id = v_user_id
    and language = p_language
    and system = p_system;

  delete from public.level_unlocks
  where user_id = v_user_id
    and language = p_language
    and system = p_system;

  -- Back to the start of the ladder, so the track agrees with the now-empty
  -- unlocks instead of claiming a level nothing supports.
  update public.language_tracks
  set current_level = 1
  where user_id = v_user_id
    and language = p_language
    and system = p_system;

  if p_reset_account_history then
    delete from public.daily_activity
    where user_id = v_user_id;

    update public.profiles
    set streak = 0,
        streak_freezes = 1,
        last_studied_on = null
    where id = v_user_id;
  end if;
end;
$$;

-- Compatibility shim. Same signature and same default as before, so a client
-- from the previous deploy still gets exactly the behaviour it expects —
-- p_reset_streak defaults to true there, and maps onto the account-history
-- flag. New callers should use reset_language_progress directly.
create or replace function public.reset_current_language_progress(
  p_language text,
  p_system text,
  p_reset_streak boolean default true
)
returns void
language sql
security definer
set search_path = public
as $$
  select public.reset_language_progress(p_language, p_system, p_reset_streak);
$$;

revoke all on function public.reset_language_progress(text, text, boolean) from public;
grant execute on function public.reset_language_progress(text, text, boolean) to authenticated;

revoke all on function public.reset_current_language_progress(text, text, boolean) from public;
grant execute on function public.reset_current_language_progress(text, text, boolean) to authenticated;

notify pgrst, 'reload schema';
