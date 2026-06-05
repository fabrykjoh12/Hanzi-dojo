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

alter table public.writing_stats
add column if not exists correct_streak int not null default 0;

drop trigger if exists writing_stats_set_updated_at on public.writing_stats;
create trigger writing_stats_set_updated_at
before update on public.writing_stats
for each row execute function public.set_updated_at();

create index if not exists writing_stats_user_xp_idx
on public.writing_stats(user_id, xp desc);

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

notify pgrst, 'reload schema';
