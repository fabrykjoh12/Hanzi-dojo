-- Interactive chat stories: reply data for a presentation='chat' story the
-- learner replies inside. Null for every existing story (observer chat + all
-- other formats stay unchanged). Shape:
--   { "you": "<speaker name>",
--     "distractors": { "<beat index>": [ { "text": "...", "pinyin": "..." } ] } }
-- The correct reply at each interactive beat is that beat's own content text;
-- only the distractors are stored here.
alter table public.stories
  add column if not exists interactions jsonb;
