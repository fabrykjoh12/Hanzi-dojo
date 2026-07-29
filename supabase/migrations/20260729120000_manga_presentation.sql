-- Hanzi Dojo Stories — the manga reader.
--
-- A fourth presentation alongside paced / chat / scene: a vertical cinematic
-- manga episode. The Chinese itself stays where every other format keeps it
-- (`content`, one beat per line, `english_content` line-parallel), so the manga
-- reader inherits the whole existing engine — vocabulary matching, tappable
-- words, the lookup popover, per-line audio, add-to-deck, readability.
--
-- `panels` carries ONLY what art adds on top of that: which beats live on which
-- panel, where a speech bubble sits over the art, and the story choices. Keeping
-- the text out of it is deliberate — see docs/ARCHITECTURE.md: educational text
-- is rendered by the app, never baked into an image or duplicated beside it.
--
-- Shape (validated by src/mangaLayout.js, which tolerates every field being
-- absent and falls back to a readable default rather than throwing):
--
--   {
--     "meta":   { "series", "episode_label", "episode_title", "art_base" },
--     "cast":   { "<speaker>": { "display", "side" } },
--     "panels": [
--       { "id", "art", "ratio", "alt", "emphasis",
--         "bubbles": [ { "beat", "kind", "side", "top", "width", "tail" } ],
--         "choice":  { "prompt", "options": [ { "beat", "then" } ] } }
--     ]
--   }
alter table public.stories
  add column if not exists panels jsonb;

alter table public.stories
  drop constraint if exists stories_presentation_check;
alter table public.stories
  add constraint stories_presentation_check
  check (presentation in ('paced', 'chat', 'scene', 'manga')) not valid;

-- NOT VALID: adding a CHECK the normal way scans every row of `stories` and
-- blocks writes for the length of that scan. The constraint still applies to
-- every INSERT and UPDATE from this point on — it just does not re-prove the
-- rows already there, which the previous constraint already guaranteed. A later
-- ordered migration can `validate constraint stories_presentation_check` when
-- it is convenient to take the scan.
