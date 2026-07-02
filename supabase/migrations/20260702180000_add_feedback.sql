-- In-app feedback: bug reports, ideas, and general notes from users. Read by
-- the project owner via the Supabase dashboard (Table Editor / SQL editor) —
-- no in-app admin view for now.

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  email text,
  category text not null check (category in ('bug', 'idea', 'other')),
  message text not null check (char_length(trim(message)) > 0),
  page text,
  language text,
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

create policy "users can read own feedback"
on public.feedback
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "users can insert own feedback"
on public.feedback
for insert to authenticated
with check ((select auth.uid()) = user_id);

notify pgrst, 'reload schema';
