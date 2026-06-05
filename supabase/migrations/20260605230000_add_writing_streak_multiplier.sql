alter table public.writing_stats
add column if not exists correct_streak int not null default 0;

notify pgrst, 'reload schema';
