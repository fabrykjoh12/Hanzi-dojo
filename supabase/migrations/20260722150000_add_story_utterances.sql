-- supabase/migrations/20260722150000_add_story_utterances.sql
--
-- Stories, addressable line by line.
--
-- The readers already treat a story as a list of beats: `content` is split on
-- newlines, blank lines dropped, and beat N is what gets highlighted and spoken.
-- This table gives each of those beats a stable identity, a speaker and a voice,
-- so narration can be generated, regenerated and replayed ONE LINE AT A TIME
-- rather than as a single indivisible recording.
--
-- ADDITIVE. `stories.content` remains the source of truth and is untouched;
-- `utterance_index` is deliberately the index into the same filtered beat list
-- the readers build, so a story with no rows here still plays exactly as it does
-- today (legacy per-line files, then browser speech synthesis).
--
-- Rollback: `drop table public.story_utterances cascade;`

create table if not exists public.story_utterances (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories (id) on delete cascade,

  -- Scenes come from blank lines in `content`; a story with none is one scene.
  scene_index int not null default 0,
  -- Index into the story's non-empty lines - the reader's beat index.
  utterance_index int not null,

  speaker_id text not null default 'narrator',
  hanzi text not null,                       -- spoken text, speaker label stripped
  pinyin text,
  translation text,

  -- Delivery. Null voice means "use the configured story voice", so a whole
  -- story can be re-cast by changing configuration rather than every row.
  voice text,
  speaking_rate numeric(4, 2),
  delivery_style text,
  pause_before_ms int not null default 0,
  pause_after_ms int not null default 0,

  -- Fingerprint of the source line, so a re-sync can tell an edited line from
  -- an unchanged one without re-reading every clip.
  source_hash text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One row per beat: re-syncing a story updates in place instead of
  -- duplicating, which keeps every generated clip attached to its line.
  unique (story_id, utterance_index)
);

create index if not exists story_utterances_story on public.story_utterances (story_id, utterance_index);
create index if not exists story_utterances_speaker on public.story_utterances (story_id, speaker_id);

drop trigger if exists story_utterances_touch on public.story_utterances;
create trigger story_utterances_touch before update on public.story_utterances
  for each row execute function public.tts_touch_updated_at();

-- RLS: readable by signed-in learners (the reader needs the ids to look up
-- audio); no write policy, so only the service key used by the sync script can
-- change them. Same stance as `stories` content.
alter table public.story_utterances enable row level security;

drop policy if exists "authenticated can read story utterances" on public.story_utterances;
create policy "authenticated can read story utterances" on public.story_utterances
  for select to authenticated using (true);

notify pgrst, 'reload schema';
