create extension if not exists "pgcrypto";

-- WARNING:
-- This resets the app database tables.
-- It does not delete auth.users.

drop table if exists public.story_vocab cascade;
drop table if exists public.youtube_recommendations cascade;
drop table if exists public.stories cascade;
drop table if exists public.level_unlocks cascade;
drop table if exists public.test_answers cascade;
drop table if exists public.test_attempts cascade;
drop table if exists public.daily_activity cascade;
drop table if exists public.review_logs cascade;
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
    check (active_language in ('chinese', 'japanese')),
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
  language text not null check (language in ('chinese', 'japanese')),
  system text not null check (system in ('hsk_3', 'jlpt', 'custom')),
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

  language text not null check (language in ('chinese', 'japanese')),
  system text not null check (system in ('hsk_3', 'jlpt', 'custom')),
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


-- 6. Review logs
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

  reviewed_at timestamptz not null default now()
);

create index review_logs_user_time_idx
on public.review_logs(user_id, reviewed_at desc);


-- 7. Daily activity
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


-- 8. Test attempts
create table public.test_attempts (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references public.profiles(id) on delete cascade,

  language text not null check (language in ('chinese', 'japanese')),
  system text not null check (system in ('hsk_3', 'jlpt', 'custom')),
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


-- 9. Individual answers inside a test
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


-- 10. Level unlocks
create table public.level_unlocks (
  user_id uuid not null references public.profiles(id) on delete cascade,

  language text not null check (language in ('chinese', 'japanese')),
  system text not null check (system in ('hsk_3', 'jlpt', 'custom')),
  level int not null check (level between 1 and 9),

  unlocked_at timestamptz not null default now(),

  primary key (user_id, language, system, level)
);


-- 11. Stories
create table public.stories (
  id uuid primary key default gen_random_uuid(),

  language text not null check (language in ('chinese', 'japanese')),
  system text not null check (system in ('hsk_3', 'jlpt', 'custom')),
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


-- 12. Story vocabulary mapping
-- Helps tooltips and makes it easy to know which words appear in a story.
create table public.story_vocab (
  story_id uuid not null references public.stories(id) on delete cascade,
  vocab_id uuid not null references public.vocabulary(id) on delete cascade,

  primary key (story_id, vocab_id)
);


-- 13. Curated YouTube recommendations
create table public.youtube_recommendations (
  id uuid primary key default gen_random_uuid(),

  language text not null check (language in ('chinese', 'japanese')),
  system text not null check (system in ('hsk_3', 'jlpt', 'custom')),
  level int not null check (level between 1 and 9),

  title text not null,
  channel_name text,
  video_url text not null,
  notes text,
  sort_order int not null default 1,
  is_published boolean not null default true,

  created_at timestamptz not null default now()
);


-- Enable RLS
alter table public.content_sources enable row level security;
alter table public.profiles enable row level security;
alter table public.language_tracks enable row level security;
alter table public.vocabulary enable row level security;
alter table public.cards enable row level security;
alter table public.review_logs enable row level security;
alter table public.daily_activity enable row level security;
alter table public.test_attempts enable row level security;
alter table public.test_answers enable row level security;
alter table public.level_unlocks enable row level security;
alter table public.stories enable row level security;
alter table public.story_vocab enable row level security;
alter table public.youtube_recommendations enable row level security;


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