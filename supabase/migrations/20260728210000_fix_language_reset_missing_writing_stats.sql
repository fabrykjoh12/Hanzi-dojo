-- Resetting a language's progress failed outright with
--   relation "public.writing_stats" does not exist
-- so the "Reset HSK 3.0 progress" button on Profile could not do its job at all.
--
-- Two separate faults, fixed together:
--
--   1. `writing_stats` was never created in this project. Its migration
--      (20260605224500_add_writing_stats.sql) is in the repo but was never
--      applied, which is exactly the failure mode CLAUDE.md §10 warns about —
--      and it silently cost more than the reset: src/Writing.jsx reads and
--      upserts that table on every writing answer, so writing practice has been
--      throwing its results away. Creating the table fixes both. Every statement
--      is idempotent, so this is a no-op wherever the table already exists.
--
--   2. `reset_language_progress` deleted from that table unconditionally, so one
--      absent table aborted the whole transaction and the learner kept every
--      card, unlock and test attempt. A reset is the one operation that must not
--      be all-or-nothing on a table that may not be there: the delete is now
--      guarded by a to_regclass check, so a missing optional table skips its own
--      step and everything else still clears. The set of things a reset removes
--      is otherwise unchanged (CLAUDE.md §7: cards are only ever deleted through
--      this RPC).

-- ── 1. The table, exactly as its original migration defines it ───────────────
create table if not exists public.writing_stats (
  user_id uuid not null references public.profiles(id) on delete cascade,
  vocab_id uuid not null references public.vocabulary(id) on delete cascade,

  xp int not null default 0 check (xp between 0 and 100),
  attempts int not null default 0,
  correct_count int not null default 0,
  missed_count int not null default 0,
  correct_streak int not null default 0,

  last_practiced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, vocab_id)
);

-- Added later by 20260605230000_add_writing_streak_multiplier.sql; harmless
-- where the create above already included it.
alter table public.writing_stats
add column if not exists correct_streak int not null default 0;

drop trigger if exists writing_stats_set_updated_at on public.writing_stats;
create trigger writing_stats_set_updated_at
before update on public.writing_stats
for each row execute function public.set_updated_at();

create index if not exists writing_stats_user_xp_idx
on public.writing_stats(user_id, xp desc);

-- RLS is enabled and the frontend queries run as the authenticated user, so a
-- learner reaches only their own rows (CLAUDE.md §7).
alter table public.writing_stats enable row level security;

drop policy if exists "users can read own writing stats" on public.writing_stats;
create policy "users can read own writing stats"
on public.writing_stats
for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "users can insert own writing stats" on public.writing_stats;
create policy "users can insert own writing stats"
on public.writing_stats
for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "users can update own writing stats" on public.writing_stats;
create policy "users can update own writing stats"
on public.writing_stats
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- ── 2. A reset that cannot be aborted by one absent table ────────────────────
-- Body identical to 20260725120000_per_language_progress_reset.sql apart from
-- the guarded writing_stats step.
create or replace function public.reset_language_progress(
  p_language text,
  p_system text,
  -- Account-wide, so it is opt-in: daily_activity has no language column, so
  -- there is no way to clear study history for a single language.
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

  -- Guarded: an unapplied migration must cost the learner one skipped table,
  -- never the whole reset.
  if to_regclass('public.writing_stats') is not null then
    delete from public.writing_stats ws
    using public.vocabulary v
    where ws.user_id = v_user_id
      and ws.vocab_id = v.id
      and v.language = p_language
      and v.system = p_system;
  end if;

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

revoke all on function public.reset_language_progress(text, text, boolean) from public;
grant execute on function public.reset_language_progress(text, text, boolean) to authenticated;

notify pgrst, 'reload schema';
