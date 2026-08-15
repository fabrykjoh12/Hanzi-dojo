-- Story chapter rewards: the flashcards → chapter-unlock loop.
--
-- Stories become the reward for completing the day's flashcard session:
-- chapter 1 of every series is free, later chapters unlock one per qualifying
-- session. Three pieces of server state back it:
--
--   * story_unlocks        — which chapters a learner has unlocked (append-only
--                            from the client's perspective; reset clears it).
--   * story_reward_claims  — at most ONE session reward per track per local
--                            day, enforced by the primary key. A claim may be
--                            "banked" (story_id null: the session was completed
--                            before a series was chosen) and redeemed later the
--                            same day.
--   * language_tracks.active_series — the series unit key session rewards
--                            unlock chapters in. Series have no table of their
--                            own (they are derived from panels.meta.series /
--                            title numbering — see src/storyShelf.js), so the
--                            key is text.
--
-- The claim + unlock write goes through ONE RPC so a refresh, a React
-- re-render, a network retry or a second device can never turn one session
-- into two chapters: the claim row's primary key is the idempotency key, and
-- the unlock only happens while the claim's story_id is still null.
--
-- Idempotent throughout: create if not exists / or replace / drop-then-create
-- policies.

-- ── 1. Active series on the track ─────────────────────────────────────────────

alter table public.language_tracks
add column if not exists active_series text;

-- ── 2. Unlocked chapters ──────────────────────────────────────────────────────

create table if not exists public.story_unlocks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  story_id uuid not null references public.stories(id) on delete cascade,
  -- 'session' — earned by completing a flashcard session.
  -- 'seed'    — grandfathered: chapters a learner could already reach before
  --             this system shipped (their read chapters + the next one).
  source text not null default 'session' check (source in ('session', 'seed')),
  unlocked_at timestamptz not null default now(),

  primary key (user_id, story_id)
);

alter table public.story_unlocks enable row level security;

drop policy if exists "users can read own story unlocks" on public.story_unlocks;
create policy "users can read own story unlocks"
on public.story_unlocks
for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "users can insert own story unlocks" on public.story_unlocks;
create policy "users can insert own story unlocks"
on public.story_unlocks
for insert to authenticated
with check ((select auth.uid()) = user_id);

-- ── 3. Daily session-reward claims ────────────────────────────────────────────

create table if not exists public.story_reward_claims (
  user_id uuid not null references public.profiles(id) on delete cascade,
  language text not null,
  system text not null,
  -- The learner's LOCAL date (the client sends it), matching how day-based
  -- review availability already works. The PK makes "one reward per track per
  -- day" a database fact rather than a client promise.
  claim_date date not null,
  -- Null while banked (session completed, no chapter to unlock yet); set once
  -- redeemed. ON DELETE SET NULL: losing a story must never delete the claim,
  -- or the day's reward would silently become claimable again.
  story_id uuid references public.stories(id) on delete set null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),

  primary key (user_id, language, system, claim_date)
);

alter table public.story_reward_claims enable row level security;

drop policy if exists "users can read own reward claims" on public.story_reward_claims;
create policy "users can read own reward claims"
on public.story_reward_claims
for select to authenticated
using ((select auth.uid()) = user_id);

-- No direct insert/update policies: writes go through claim_story_reward so
-- the claim → unlock pair stays atomic and idempotent.

-- ── 4. The claim RPC ──────────────────────────────────────────────────────────

-- claim_story_reward(language, system, local date, chapter to unlock or null)
--
-- Called when a qualifying flashcard session completes (with the active
-- series' next locked chapter, or null to bank the claim), and again when a
-- banked claim is redeemed from the Stories screen. Safe to call any number
-- of times: the first call of the day creates the claim, the first call that
-- carries a story while the claim is unredeemed unlocks that one chapter, and
-- every later call is a no-op that reports the existing state.
create or replace function public.claim_story_reward(
  p_language text,
  p_system text,
  p_claim_date date,
  p_story_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_claim public.story_reward_claims%rowtype;
  v_valid_story boolean := false;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- A claim needs a real track — a junk language/system pair would otherwise
  -- mint extra daily claims.
  if not exists (
    select 1 from public.language_tracks
    where user_id = v_user_id and language = p_language and system = p_system
  ) then
    raise exception 'Language track not found';
  end if;

  insert into public.story_reward_claims (user_id, language, system, claim_date)
  values (v_user_id, p_language, p_system, p_claim_date)
  on conflict (user_id, language, system, claim_date) do nothing;

  select * into v_claim
  from public.story_reward_claims
  where user_id = v_user_id and language = p_language
    and system = p_system and claim_date = p_claim_date;

  if p_story_id is not null and v_claim.story_id is null then
    select exists (
      select 1 from public.stories
      where id = p_story_id and language = p_language
        and system = p_system and is_published = true
    ) into v_valid_story;

    if v_valid_story then
      update public.story_reward_claims
      set story_id = p_story_id, redeemed_at = now()
      where user_id = v_user_id and language = p_language
        and system = p_system and claim_date = p_claim_date
        and story_id is null;

      insert into public.story_unlocks (user_id, story_id, source)
      values (v_user_id, p_story_id, 'session')
      on conflict (user_id, story_id) do nothing;

      select * into v_claim
      from public.story_reward_claims
      where user_id = v_user_id and language = p_language
        and system = p_system and claim_date = p_claim_date;
    end if;
  end if;

  return jsonb_build_object(
    'claim_date', v_claim.claim_date,
    'story_id', v_claim.story_id,
    'redeemed', v_claim.story_id is not null
  );
end;
$$;

revoke all on function public.claim_story_reward(text, text, date, uuid) from public;
grant execute on function public.claim_story_reward(text, text, date, uuid) to authenticated;

-- ── 5. Reset clears the new state too ─────────────────────────────────────────
-- Body identical to 20260728210000 plus: story_unlocks + story_reward_claims
-- deletes and active_series cleared alongside current_level.

create or replace function public.reset_language_progress(
  p_language text,
  p_system text,
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

  delete from public.story_unlocks su
  using public.stories s
  where su.user_id = v_user_id
    and su.story_id = s.id
    and s.language = p_language
    and s.system = p_system;

  delete from public.story_reward_claims
  where user_id = v_user_id
    and language = p_language
    and system = p_system;

  delete from public.test_attempts
  where user_id = v_user_id
    and language = p_language
    and system = p_system;

  delete from public.level_unlocks
  where user_id = v_user_id
    and language = p_language
    and system = p_system;

  update public.language_tracks
  set current_level = 1,
      active_series = null
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
