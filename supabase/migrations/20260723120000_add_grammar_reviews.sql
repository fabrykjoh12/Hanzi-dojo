-- Grammar as spaced practice: opt a grammar TOPIC into FSRS review. Grammar has
-- no `vocabulary` row, so it can't ride the `cards` table (which FKs vocab_id) —
-- this table gives each (user × language × system × topic) its own FSRS state.
-- The scheduling unit is the topic; a topic's several authored drill sentences
-- are just item variety, so one row per topic is enough.
--
-- Reuses src/srs.js schedule() verbatim; the app maps the returned `updates` bag
-- onto these columns (dropping is_easy/learned/interval_days, which grammar
-- review has no notion of).

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

-- Due-queue lookups are always scoped to one user + active track.
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
