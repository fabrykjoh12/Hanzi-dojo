-- Comprehension questions for stories (end-of-story understanding check).
-- English question + options so beginners are tested on comprehension, not on
-- decoding the question itself. Read-only shared content, like stories.
create table if not exists public.story_questions (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  question_number int not null,
  question text not null,
  options text[] not null,        -- 4 English answer choices
  correct_index int not null,     -- index (0-3) of the correct option
  created_at timestamptz not null default now(),
  unique (story_id, question_number)
);

alter table public.story_questions enable row level security;

-- Logged-in users can read; inserts happen via the service key (RLS-bypassing)
-- content generator, so no insert policy is needed.
create policy "authenticated users can read story questions"
on public.story_questions
for select to authenticated
using (true);
