-- Story completion tracking: which stories a user has finished reading.
-- Powers read-checkmarks on the story list, "N of M read" tier progress, and
-- the one-time XP award for finishing a story.

create table public.story_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  story_id uuid not null references public.stories(id) on delete cascade,
  read_at timestamptz not null default now(),

  primary key (user_id, story_id)
);

alter table public.story_reads enable row level security;

create policy "users can read own story reads"
on public.story_reads
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "users can insert own story reads"
on public.story_reads
for insert to authenticated
with check ((select auth.uid()) = user_id);

-- Progress reset should clear story reads for the track's language too.
-- Full function replacement (same body as before + the story_reads delete).
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

notify pgrst, 'reload schema';
