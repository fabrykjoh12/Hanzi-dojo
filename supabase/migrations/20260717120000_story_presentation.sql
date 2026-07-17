-- How a story is presented in the reader:
--   'paced' — beat-by-beat Paced Reveal (default for the whole existing library)
--   'chat'  — messaging-style conversation (future)
--   'scene' — illustrated visual-novel scenes (future)
-- Classic continuous-scroll is a per-user viewing preference, NOT a value here.
alter table public.stories
  add column if not exists presentation text not null default 'paced';

-- Constrain to the known set so a typo can't silently render as classic.
alter table public.stories
  drop constraint if exists stories_presentation_check;
alter table public.stories
  add constraint stories_presentation_check
  check (presentation in ('paced', 'chat', 'scene'));
