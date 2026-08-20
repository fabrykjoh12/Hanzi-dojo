-- Provenance for generated/staged stories (FAB-9/FAB-10).
--
-- The targeted-generation pipeline stages accepted candidates as
-- is_published=false rows. This column records where such a row came from:
-- batch id, manifest id, generator/prompt/validator versions, provider/model,
-- attempt count, generated timestamp, and a summary of the manifest's target
-- vocabulary. Written ONLY by stage-story-candidates.mjs (service key);
-- existing rows stay NULL.
--
-- Deliberately inert at runtime: no app query reads it, no RLS change, no
-- index. It exists so accept/repair/reject analysis over a batch is possible
-- after the fact — never to change story behavior in the product.

alter table public.stories
  add column if not exists generation_meta jsonb;

comment on column public.stories.generation_meta is
  'Provenance of generated stories (batch/manifest ids, generator+prompt+validator versions, provider/model, attempts, targets). NULL for hand-authored and legacy rows. Never read at runtime.';
