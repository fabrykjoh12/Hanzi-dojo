-- Reading → review mining: remember the sentence a learner was reading when they
-- added a word to their deck, so the review card can show that real context (more
-- memorable than a generic example). Nullable; older cards and batch adds leave
-- it null and fall back to the vocabulary's example sentence.
alter table public.cards
  add column if not exists source_sentence text;
