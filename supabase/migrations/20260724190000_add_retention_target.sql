-- The retention dial: how hard the learner wants to remember.
--
-- target_retention is FSRS's `request_retention` — the probability the scheduler
-- aims for that a card is still recalled when it comes due. Higher means shorter
-- intervals (more reviews, less forgetting); lower means longer intervals (fewer
-- reviews, a little more forgetting).
--
-- Default 0.90 is the ts-fsrs library default, which is what the app has always
-- scheduled with, so existing learners see no change at all until they opt in.
-- The CHECK bounds it to 0.80–0.95: outside that band FSRS's interval math stops
-- behaving sensibly (runaway intervals below, near-daily churn above), so the
-- dial is deliberately not a free-form number.
alter table public.profiles
  add column if not exists target_retention numeric(3,2) not null default 0.90;

alter table public.profiles
  drop constraint if exists profiles_target_retention_range;

alter table public.profiles
  add constraint profiles_target_retention_range
  check (target_retention >= 0.80 and target_retention <= 0.95);

notify pgrst, 'reload schema';
