-- Contextual feedback. A report sent from inside a reader now carries the
-- exact story (id + truncated title) and the running build sha, so "the pinyin
-- is wrong" arrives pinned to the content it is about instead of needing a
-- round-trip asking which story. Written by the client at insert time
-- (src/Feedback.jsx + src/feedbackContext.js); no personal data beyond what
-- feedback already holds. Idempotent.

alter table public.feedback
  add column if not exists context jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
