-- Rename the fourth presentation: 'manga' → 'manhua'.
--
-- Manhua (漫画) is the Chinese word for the form; manga is the Japanese one. The
-- product is Chinese-only, so the format is called what a Chinese reader would
-- call it. Nothing about the shape of `panels` changes — this is the tag and the
-- tag alone. The app-side rename is in src/manhua*.js / src/Manhua*.jsx.
--
-- Idempotent and order-independent: the constraint accepts both spellings while
-- the rows are being moved, and the UPDATE is a no-op once it has run.
alter table public.stories
  drop constraint if exists stories_presentation_check;
alter table public.stories
  add constraint stories_presentation_check
  check (presentation in ('paced', 'chat', 'scene', 'manga', 'manhua')) not valid;

update public.stories
  set presentation = 'manhua'
  where presentation = 'manga';

-- With no row left on the old spelling, drop it from the accepted set so a
-- future publish cannot reintroduce it.
alter table public.stories
  drop constraint if exists stories_presentation_check;
alter table public.stories
  add constraint stories_presentation_check
  check (presentation in ('paced', 'chat', 'scene', 'manhua')) not valid;

-- NOT VALID for the same reason as 20260729120000: it applies to every INSERT
-- and UPDATE from here on without taking a full-table scan on `stories`. The
-- UPDATE above is what proves the existing rows.
