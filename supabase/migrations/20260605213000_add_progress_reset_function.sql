-- Lets a signed-in user reset their own progress for a language/system track.
create or replace function public.reset_current_language_progress(
  p_language text,
  p_system text,
  p_reset_streak boolean default true
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

  select exists (
    select 1
    from public.language_tracks
    where user_id = v_user_id
      and language = p_language
      and system = p_system
      and is_active = true
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

  delete from public.test_attempts
  where user_id = v_user_id
    and language = p_language
    and system = p_system;

  delete from public.level_unlocks
  where user_id = v_user_id
    and language = p_language
    and system = p_system;

  if p_reset_streak then
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

revoke all on function public.reset_current_language_progress(text, text, boolean) from public;
grant execute on function public.reset_current_language_progress(text, text, boolean) to authenticated;

notify pgrst, 'reload schema';
