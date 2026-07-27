-- Review-screen redesign: remember which story (and its English line) a
-- source_sentence came from, so the flashcard answer side can show "FROM
-- <title>" plus a translation instead of just the bare sentence. Nullable and
-- additive, same pattern as source_sentence itself (20260718160000) — older
-- cards, non-story adds, and an unmigrated client all keep working with these
-- columns simply absent/null.
alter table public.cards
  add column if not exists source_story_id uuid references public.stories(id) on delete set null,
  add column if not exists source_story_title text,
  add column if not exists source_translation text;
