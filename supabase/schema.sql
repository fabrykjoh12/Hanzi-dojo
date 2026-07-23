create extension if not exists "pgcrypto";

-- WARNING:
-- This resets the app database tables.
-- It does not delete auth.users.

drop table if exists public.analytics_events cascade;
drop table if exists public.story_vocab cascade;
drop table if exists public.youtube_recommendations cascade;
drop table if exists public.stories cascade;
drop table if exists public.level_unlocks cascade;
drop table if exists public.test_answers cascade;
drop table if exists public.test_attempts cascade;
drop table if exists public.daily_activity cascade;
drop table if exists public.review_logs cascade;
drop table if exists public.writing_stats cascade;
drop table if exists public.cards cascade;
drop table if exists public.vocabulary cascade;
drop table if exists public.language_tracks cascade;
drop table if exists public.profiles cascade;
drop table if exists public.content_sources cascade;

-- Keeps updated_at columns current
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;


-- 1. Content sources
-- Used to document where vocabulary/story data came from.
create table public.content_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_type text not null check (source_type in ('official_list', 'dictionary', 'manual', 'tts', 'other')),
  license_note text,
  source_url text,
  notes text,
  created_at timestamptz not null default now()
);


-- 2. User profile
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  active_language text not null default 'chinese'
    check (active_language in ('chinese', 'japanese', 'russian')),
  daily_new_cards int not null default 10
    check (daily_new_cards between 1 and 100),
  streak int not null default 0,
  streak_freezes int not null default 1,
  last_studied_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();


-- 3. User language tracks
-- One user can have Chinese HSK 3.0 and Japanese JLPT progress in the same account.
create table public.language_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  language text not null check (language in ('chinese', 'japanese', 'russian')),
  system text not null check (system in ('hsk_3', 'jlpt', 'russian', 'custom')),
  current_level int not null check (current_level between 1 and 9),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, language, system)
);

create trigger language_tracks_set_updated_at
before update on public.language_tracks
for each row execute function public.set_updated_at();


-- 4. Shared vocabulary
-- This is the master word list. Same for every user.
create table public.vocabulary (
  id uuid primary key default gen_random_uuid(),

  language text not null check (language in ('chinese', 'japanese', 'russian')),
  system text not null check (system in ('hsk_3', 'jlpt', 'russian', 'custom')),
  level int not null check (level between 1 and 9),

  sort_order int not null,
  lesson_group int,
  category text,
  priority int,

  word text not null,
  reading text,
  reading_plain text,
  meaning text not null,
  part_of_speech text,
  example_sentence text,
  example_reading text,
  example_translation text,

  audio_path text,
  audio_provider text,
  audio_voice text,

  source_id uuid references public.content_sources(id) on delete set null,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (language, system, level, sort_order)
);

create trigger vocabulary_set_updated_at
before update on public.vocabulary
for each row execute function public.set_updated_at();

create index vocabulary_lookup_idx
on public.vocabulary(language, system, level, sort_order);

create index vocabulary_word_idx
on public.vocabulary(language, system, level, word);


-- 5. User card progress
-- A card row is created when the user first sees a vocabulary item.
create table public.cards (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references public.profiles(id) on delete cascade,
  vocab_id uuid not null references public.vocabulary(id) on delete cascade,

  state text not null default 'new'
    check (state in ('new', 'learning', 'review', 'relearning')),

  learning_step int not null default 0,
  ease_factor numeric(4,2) not null default 2.50,
  interval_days int not null default 0,
  due_at timestamptz not null default now(),

  is_easy boolean not null default false,
  learned boolean not null default false,

  review_count int not null default 0,
  lapse_count int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, vocab_id)
);

create trigger cards_set_updated_at
before update on public.cards
for each row execute function public.set_updated_at();

create index cards_user_due_idx
on public.cards(user_id, due_at);

create index cards_user_state_idx
on public.cards(user_id, state);

create index cards_vocab_idx
on public.cards(vocab_id);


-- 6. Writing practice stats
create table public.writing_stats (
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

create trigger writing_stats_set_updated_at
before update on public.writing_stats
for each row execute function public.set_updated_at();

create index writing_stats_user_xp_idx
on public.writing_stats(user_id, xp desc);


-- 7. Review logs
create table public.review_logs (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references public.profiles(id) on delete cascade,
  card_id uuid references public.cards(id) on delete set null,
  vocab_id uuid not null references public.vocabulary(id) on delete cascade,

  grade int not null check (grade between 0 and 3),
  previous_state text,
  next_state text,
  previous_interval_days int,
  next_interval_days int,

  -- Client-generated idempotency key for grades replayed from the offline
  -- outbox (see public.grade_card). Null for grades written online.
  client_op_id uuid,

  reviewed_at timestamptz not null default now()
);

create index review_logs_user_time_idx
on public.review_logs(user_id, reviewed_at desc);

create unique index review_logs_user_op_idx
on public.review_logs(user_id, client_op_id)
where client_op_id is not null;


-- 8. Daily activity
create table public.daily_activity (
  user_id uuid not null references public.profiles(id) on delete cascade,
  activity_date date not null default current_date,

  studied_cards int not null default 0,
  new_cards int not null default 0,
  learning_cards int not null default 0,
  review_cards int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, activity_date)
);

create trigger daily_activity_set_updated_at
before update on public.daily_activity
for each row execute function public.set_updated_at();


-- 9. Test attempts
create table public.test_attempts (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references public.profiles(id) on delete cascade,

  language text not null check (language in ('chinese', 'japanese', 'russian')),
  system text not null check (system in ('hsk_3', 'jlpt', 'russian', 'custom')),
  level int not null check (level between 1 and 9),

  attempt_date date not null default current_date,
  score numeric(5,2) not null default 0,
  total_questions int not null default 30,
  correct_count int not null default 0,
  passed boolean not null default false,

  created_at timestamptz not null default now()
);

create index test_attempts_user_date_idx
on public.test_attempts(user_id, attempt_date desc);

create index test_attempts_level_idx
on public.test_attempts(user_id, language, system, level, attempt_date);


-- 10. Individual answers inside a test
create table public.test_answers (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references public.profiles(id) on delete cascade,
  attempt_id uuid not null references public.test_attempts(id) on delete cascade,
  vocab_id uuid not null references public.vocabulary(id) on delete cascade,

  user_answer text,
  correct_answer text,
  was_correct boolean not null default false,

  created_at timestamptz not null default now()
);

create index test_answers_attempt_idx
on public.test_answers(attempt_id);


-- 11. Level unlocks
create table public.level_unlocks (
  user_id uuid not null references public.profiles(id) on delete cascade,

  language text not null check (language in ('chinese', 'japanese', 'russian')),
  system text not null check (system in ('hsk_3', 'jlpt', 'russian', 'custom')),
  level int not null check (level between 1 and 9),

  unlocked_at timestamptz not null default now(),

  primary key (user_id, language, system, level)
);


-- 12. Stories
create table public.stories (
  id uuid primary key default gen_random_uuid(),

  language text not null check (language in ('chinese', 'japanese', 'russian')),
  system text not null check (system in ('hsk_3', 'jlpt', 'russian', 'custom')),
  level int not null check (level between 1 and 9),
  story_number int not null,

  title text not null,
  content text not null,
  english_summary text,

  is_published boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (language, system, level, story_number)
);

create trigger stories_set_updated_at
before update on public.stories
for each row execute function public.set_updated_at();


-- 13. Story vocabulary mapping
-- Helps tooltips and makes it easy to know which words appear in a story.
create table public.story_vocab (
  story_id uuid not null references public.stories(id) on delete cascade,
  vocab_id uuid not null references public.vocabulary(id) on delete cascade,

  primary key (story_id, vocab_id)
);


-- 14. Curated YouTube recommendations
create table public.youtube_recommendations (
  id uuid primary key default gen_random_uuid(),

  language text not null check (language in ('chinese', 'japanese', 'russian')),
  system text not null check (system in ('hsk_3', 'jlpt', 'russian', 'custom')),
  level int not null check (level between 1 and 9),

  title text not null,
  channel_name text,
  video_url text not null,
  notes text,
  sort_order int not null default 1,
  is_published boolean not null default true,

  created_at timestamptz not null default now()
);


-- 15. Analytics events
-- Lightweight, privacy-friendly product analytics: one append-only event log for
-- the learning journey (funnel steps, session metrics). Never stores personal
-- text — no story contents, typed answers, or email addresses. `props` is a small
-- JSON bag of counts / enums / ids only.
create table public.analytics_events (
  id          bigint generated always as identity primary key,
  -- Null for pre-signup funnel steps (Landing viewed / Signup started), else the
  -- signed-in user. `set null` keeps the funnel intact if an account is deleted.
  user_id     uuid references auth.users(id) on delete set null,
  session_id  text,                 -- per app-load id (client-generated, not a login session)
  name        text not null,        -- event name, e.g. 'onboarding_completed'
  language    text,                 -- 'chinese' | 'japanese' | 'russian' | null
  level       int,                  -- current track level, or null
  app_version text,                 -- build sha, so events can be attributed to a release
  props       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index analytics_events_name_created_idx on public.analytics_events (name, created_at);
create index analytics_events_user_created_idx on public.analytics_events (user_id, created_at);
create index analytics_events_session_idx on public.analytics_events (session_id);


-- Enable RLS
alter table public.content_sources enable row level security;
alter table public.profiles enable row level security;
alter table public.language_tracks enable row level security;
alter table public.vocabulary enable row level security;
alter table public.cards enable row level security;
alter table public.writing_stats enable row level security;
alter table public.review_logs enable row level security;
alter table public.daily_activity enable row level security;
alter table public.test_attempts enable row level security;
alter table public.test_answers enable row level security;
alter table public.level_unlocks enable row level security;
alter table public.stories enable row level security;
alter table public.story_vocab enable row level security;
alter table public.youtube_recommendations enable row level security;
alter table public.analytics_events enable row level security;


-- RLS policies

-- Shared content: logged-in users can read.
create policy "authenticated users can read content sources"
on public.content_sources
for select to authenticated
using (true);

create policy "authenticated users can read vocabulary"
on public.vocabulary
for select to authenticated
using (true);

create policy "authenticated users can read published stories"
on public.stories
for select to authenticated
using (is_published = true);

create policy "authenticated users can read story vocabulary"
on public.story_vocab
for select to authenticated
using (true);

create policy "authenticated users can read youtube recommendations"
on public.youtube_recommendations
for select to authenticated
using (is_published = true);


-- Profiles
create policy "users can read own profile"
on public.profiles
for select to authenticated
using ((select auth.uid()) = id);

create policy "users can insert own profile"
on public.profiles
for insert to authenticated
with check ((select auth.uid()) = id);

create policy "users can update own profile"
on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);


-- Language tracks
create policy "users can read own language tracks"
on public.language_tracks
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "users can insert own language tracks"
on public.language_tracks
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "users can update own language tracks"
on public.language_tracks
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "users can delete own language tracks"
on public.language_tracks
for delete to authenticated
using ((select auth.uid()) = user_id);


-- Cards
create policy "users can read own cards"
on public.cards
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "users can insert own cards"
on public.cards
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "users can update own cards"
on public.cards
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "users can delete own cards"
on public.cards
for delete to authenticated
using ((select auth.uid()) = user_id);


-- Writing stats
create policy "users can read own writing stats"
on public.writing_stats
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "users can insert own writing stats"
on public.writing_stats
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "users can update own writing stats"
on public.writing_stats
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);


-- Review logs
create policy "users can read own review logs"
on public.review_logs
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "users can insert own review logs"
on public.review_logs
for insert to authenticated
with check ((select auth.uid()) = user_id);


-- Daily activity
create policy "users can read own daily activity"
on public.daily_activity
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "users can insert own daily activity"
on public.daily_activity
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "users can update own daily activity"
on public.daily_activity
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);


-- Test attempts
create policy "users can read own test attempts"
on public.test_attempts
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "users can insert own test attempts"
on public.test_attempts
for insert to authenticated
with check ((select auth.uid()) = user_id);


-- Test answers
create policy "users can read own test answers"
on public.test_answers
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "users can insert own test answers"
on public.test_answers
for insert to authenticated
with check ((select auth.uid()) = user_id);


-- Level unlocks
create policy "users can read own level unlocks"
on public.level_unlocks
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "users can insert own level unlocks"
on public.level_unlocks
for insert to authenticated
with check ((select auth.uid()) = user_id);


-- Analytics events
-- Append-only for clients. Signed-in users may insert rows attributed to
-- themselves; signed-out clients (anon key) may insert user_id-null events so the
-- top of the funnel (Landing -> Signup) is measurable. No client SELECT/UPDATE/
-- DELETE — dashboards read with the service role. Trade-off: because the anon key
-- is public, anonymous rows are effectively world-insertable, which is acceptable
-- for product analytics (it never exposes user data and cannot modify rows).
create policy "analytics insert own or anon"
on public.analytics_events
for insert
with check (user_id is null or auth.uid() = user_id);


-- Progress reset
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

  delete from public.writing_stats ws
  using public.vocabulary v
  where ws.user_id = v_user_id
    and ws.vocab_id = v.id
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


-- Transactional grading (mirrors 20260722120000_transactional_grading.sql).
-- The whole flashcard grade write — card row, review log, daily activity — in
-- one transaction, so a mid-write failure can never leave partial state.
--
-- p_updates is applied through an explicit column whitelist, so arbitrary keys
-- cannot steer the write. The user id is always auth.uid(), never client-supplied,
-- and the update path asserts the card belongs to that user.
-- p_activity: {date, mode:'set'|'increment', studied, new, learning, review} —
-- 'set' writes the online screen's absolute session totals, 'increment' adds the
-- op's own counts (offline replay). p_op_id dedupes replayed grades.
create or replace function public.grade_card(
  p_vocab_id uuid default null,
  p_updates jsonb default '{}'::jsonb,
  p_card_id uuid default null,
  p_log jsonb default null,
  p_activity jsonb default null,
  p_op_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_card_id uuid;
  v_vocab_id uuid;
  v_log_id uuid;
  v_mode text;
  v_day date;
  -- Did this call create the card row? "Undo" deletes only a row its own grade
  -- created — never one another device had already made.
  v_inserted boolean := false;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- A jsonb argument sent as JSON null can arrive as 'null'::jsonb rather than
  -- SQL NULL, which is NOT null and would make the blocks below run on empty
  -- input. Normalise once so "absent" means absent everywhere.
  if p_updates is null or jsonb_typeof(p_updates) <> 'object' then
    p_updates := '{}'::jsonb;
  end if;
  if p_log is not null and jsonb_typeof(p_log) <> 'object' then
    p_log := null;
  end if;
  if p_activity is not null and jsonb_typeof(p_activity) <> 'object' then
    p_activity := null;
  end if;

  if p_op_id is not null then
    select id, card_id into v_log_id, v_card_id
    from public.review_logs
    where user_id = v_user_id and client_op_id = p_op_id
    limit 1;
    if found then
      return jsonb_build_object(
        'card_id', v_card_id, 'log_id', v_log_id, 'already_applied', true);
    end if;
  end if;

  if p_card_id is not null then
    update public.cards c set
      state          = coalesce(p_updates->>'state', c.state),
      interval_days  = coalesce((p_updates->>'interval_days')::int, c.interval_days),
      due_at         = coalesce((p_updates->>'due_at')::timestamptz, c.due_at),
      is_easy        = coalesce((p_updates->>'is_easy')::boolean, c.is_easy),
      learned        = coalesce((p_updates->>'learned')::boolean, c.learned),
      stability      = coalesce((p_updates->>'stability')::real, c.stability),
      difficulty     = coalesce((p_updates->>'difficulty')::real, c.difficulty),
      reps           = coalesce((p_updates->>'reps')::int, c.reps),
      lapses         = coalesce((p_updates->>'lapses')::int, c.lapses),
      last_review    = coalesce((p_updates->>'last_review')::timestamptz, c.last_review),
      scheduled_days = coalesce((p_updates->>'scheduled_days')::int, c.scheduled_days),
      elapsed_days   = coalesce((p_updates->>'elapsed_days')::int, c.elapsed_days),
      learning_step  = coalesce((p_updates->>'learning_step')::int, c.learning_step)
    where c.id = p_card_id
      and c.user_id = v_user_id
    returning c.id, c.vocab_id into v_card_id, v_vocab_id;

    if not found then
      raise exception 'Card not found';
    end if;
  else
    if p_vocab_id is null then
      raise exception 'vocab_id required for a new card';
    end if;
    select not exists (
      select 1 from public.cards
      where user_id = v_user_id and vocab_id = p_vocab_id
    ) into v_inserted;
    insert into public.cards as c (
      user_id, vocab_id, state, interval_days, due_at, is_easy, learned,
      stability, difficulty, reps, lapses, last_review,
      scheduled_days, elapsed_days, learning_step
    )
    values (
      v_user_id,
      p_vocab_id,
      coalesce(p_updates->>'state', 'new'),
      coalesce((p_updates->>'interval_days')::int, 0),
      coalesce((p_updates->>'due_at')::timestamptz, now()),
      coalesce((p_updates->>'is_easy')::boolean, false),
      coalesce((p_updates->>'learned')::boolean, false),
      coalesce((p_updates->>'stability')::real, 0),
      coalesce((p_updates->>'difficulty')::real, 0),
      coalesce((p_updates->>'reps')::int, 0),
      coalesce((p_updates->>'lapses')::int, 0),
      (p_updates->>'last_review')::timestamptz,
      coalesce((p_updates->>'scheduled_days')::int, 0),
      coalesce((p_updates->>'elapsed_days')::int, 0),
      coalesce((p_updates->>'learning_step')::int, 0)
    )
    on conflict (user_id, vocab_id) do update set
      state          = excluded.state,
      interval_days  = excluded.interval_days,
      due_at         = excluded.due_at,
      is_easy        = excluded.is_easy,
      learned        = excluded.learned,
      stability      = excluded.stability,
      difficulty     = excluded.difficulty,
      reps           = excluded.reps,
      lapses         = excluded.lapses,
      last_review    = excluded.last_review,
      scheduled_days = excluded.scheduled_days,
      elapsed_days   = excluded.elapsed_days,
      learning_step  = excluded.learning_step
    returning c.id, c.vocab_id into v_card_id, v_vocab_id;
  end if;

  if p_log is not null then
    begin
      insert into public.review_logs (
        user_id, card_id, vocab_id, grade,
        previous_state, next_state,
        previous_interval_days, next_interval_days,
        client_op_id
      )
      values (
        v_user_id,
        v_card_id,
        coalesce(p_vocab_id, v_vocab_id),
        coalesce((p_log->>'grade')::int, 0),
        p_log->>'previous_state',
        p_log->>'next_state',
        (p_log->>'previous_interval_days')::int,
        (p_log->>'next_interval_days')::int,
        p_op_id
      )
      returning id into v_log_id;
    exception when unique_violation then
      if p_op_id is null then
        raise;
      end if;
      select id, card_id into v_log_id, v_card_id
      from public.review_logs
      where user_id = v_user_id and client_op_id = p_op_id
      limit 1;
      return jsonb_build_object(
        'card_id', v_card_id, 'log_id', v_log_id, 'already_applied', true);
    end;
  end if;

  if p_activity is not null then
    v_mode := coalesce(p_activity->>'mode', 'set');
    v_day := coalesce((p_activity->>'date')::date, current_date);
    insert into public.daily_activity as da (
      user_id, activity_date, studied_cards, new_cards, learning_cards, review_cards
    )
    values (
      v_user_id,
      v_day,
      coalesce((p_activity->>'studied')::int, 0),
      coalesce((p_activity->>'new')::int, 0),
      coalesce((p_activity->>'learning')::int, 0),
      coalesce((p_activity->>'review')::int, 0)
    )
    on conflict (user_id, activity_date) do update set
      studied_cards  = case when v_mode = 'increment'
                            then da.studied_cards + excluded.studied_cards
                            else excluded.studied_cards end,
      new_cards      = case when v_mode = 'increment'
                            then da.new_cards + excluded.new_cards
                            else excluded.new_cards end,
      learning_cards = case when v_mode = 'increment'
                            then da.learning_cards + excluded.learning_cards
                            else excluded.learning_cards end,
      review_cards   = case when v_mode = 'increment'
                            then da.review_cards + excluded.review_cards
                            else excluded.review_cards end;
  end if;

  return jsonb_build_object(
    'card_id', v_card_id, 'log_id', v_log_id,
    'already_applied', false, 'inserted', v_inserted);
end;
$$;

revoke all on function public.grade_card(uuid, jsonb, uuid, jsonb, jsonb, uuid) from public;
grant execute on function public.grade_card(uuid, jsonb, uuid, jsonb, jsonb, uuid) to authenticated;

notify pgrst, 'reload schema';


-- Starter content source row
insert into public.content_sources (
  name,
  source_type,
  license_note,
  notes
)
values (
  'HSK 3.0 Level 1 curated list',
  'official_list',
  'Verify final licensing/source attribution before public release.',
  'Master vocabulary source for Chinese HSK 3.0 Level 1.'
);


-- Grammar spaced practice: FSRS state per opted-in grammar TOPIC (grammar has no
-- vocabulary row, so it can't ride `cards`). Mirror of migration
-- 20260723120000_add_grammar_reviews.sql. Reuses src/srs.js schedule().
create table if not exists public.grammar_reviews (
  user_id uuid not null references public.profiles(id) on delete cascade,
  language text not null,
  system text not null,
  topic_id text not null,
  state text not null default 'new' check (state in ('new','learning','review','relearning')),
  due_at timestamptz,
  stability real,
  difficulty real,
  reps int not null default 0,
  lapses int not null default 0,
  last_review timestamptz,
  scheduled_days int,
  elapsed_days int,
  learning_step int,
  created_at timestamptz not null default now(),
  primary key (user_id, language, system, topic_id)
);

create index if not exists grammar_reviews_track_idx
  on public.grammar_reviews (user_id, language, system);

alter table public.grammar_reviews enable row level security;

create policy "users can read own grammar reviews"
on public.grammar_reviews
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "users can insert own grammar reviews"
on public.grammar_reviews
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "users can update own grammar reviews"
on public.grammar_reviews
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "users can delete own grammar reviews"
on public.grammar_reviews
for delete to authenticated
using ((select auth.uid()) = user_id);
