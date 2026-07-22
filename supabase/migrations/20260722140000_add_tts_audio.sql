-- supabase/migrations/20260722140000_add_tts_audio.sql
--
-- Generated speech: metadata, pronunciation overrides, and generation jobs.
--
-- STRUCTURE ONLY. This migration creates no audio and inserts no rows - paid
-- generation is a separate, explicitly confirmed operation (`npm run tts:generate`).
--
-- Non-destructive by design: nothing here alters `vocabulary`, `stories`, or the
-- existing `audio_path` / `has_audio` columns. Until a row exists in tts_audio,
-- every screen keeps playing exactly the audio it plays today, so this migration
-- can be applied well before (or entirely without) any generation run.
--
-- Rollback: `drop table public.tts_jobs, public.tts_audio,
-- public.tts_pronunciation_overrides cascade;` plus the two functions at the
-- bottom. Nothing else in the schema depends on them.

-- Shared updated_at trigger for the three tables below.
create or replace function public.tts_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pronunciation overrides
-- ---------------------------------------------------------------------------
-- Pins the reading of a word or phrase so Mandarin polyphones (银行, 长, 行, 觉)
-- and names are spoken correctly. Word- and phrase-level on purpose: a lone
-- ambiguous character has no single correct reading.
create table if not exists public.tts_pronunciation_overrides (
  id uuid primary key default gen_random_uuid(),
  source_text text not null,                 -- the context the correction came from
  matched_text text not null,                -- the span to pin, e.g. '银行'
  pinyin text not null,                      -- tone-marked or tone-numbered, e.g. 'yínháng'
  context text,                              -- null = everywhere; else 'word' | 'sentence' | 'story' | 'dialogue'
  provider_representation text,              -- optional exact provider phones, e.g. 'yin2 hang2'
  locale text not null default 'zh-CN',
  -- 'inferred' is how a machine-derived reading is stored honestly. Only a human
  -- action may set 'verified' or 'rejected' (enforced in src/tts/overrides.js).
  verification text not null default 'unreviewed'
    check (verification in ('unreviewed', 'inferred', 'needs_review', 'verified', 'rejected')),
  reviewer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One override per (span, context, locale). coalesce() makes the null context
-- participate in uniqueness instead of allowing unlimited duplicates.
create unique index if not exists tts_overrides_unique
  on public.tts_pronunciation_overrides (matched_text, coalesce(context, ''), locale);
create index if not exists tts_overrides_locale on public.tts_pronunciation_overrides (locale);

-- ---------------------------------------------------------------------------
-- Generated audio
-- ---------------------------------------------------------------------------
create table if not exists public.tts_audio (
  id uuid primary key default gen_random_uuid(),

  -- What was spoken. Not a foreign key: source_id points at either a vocabulary
  -- row or a story utterance, and a hard FK to one of them would forbid the other.
  source_type text not null check (source_type in ('vocabulary', 'story_utterance')),
  source_id uuid not null,
  variant text not null check (variant in (
    'word', 'word_slow', 'sentence', 'sentence_slow', 'utterance', 'utterance_slow'
  )),

  source_text text not null,                 -- as authored
  normalized_text text not null,             -- as hashed and as sent
  locale text not null default 'zh-CN',

  -- How it was spoken. Every one of these is part of content_hash.
  provider text not null,
  provider_version text,                     -- API/model version, for attribution
  voice text not null,
  speaking_rate numeric(4, 2) not null,
  pronunciation_override_version text not null default 'none',
  output_format text not null,
  synthesis_config_version int not null,
  content_hash text not null,

  -- Lifecycle. 'stale' keeps serving the old file while it waits to be
  -- regenerated, so an edit never leaves a learner with silence.
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'failed', 'stale', 'needs_review', 'rejected')),
  storage_path text,                         -- key in the public `audio` bucket
  duration_ms int,
  byte_length int,
  character_count int,
  request_count int not null default 0,      -- paid requests spent on this row

  error_code text,
  error_message text,

  generated_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The idempotency key: one current row per thing-said. Regeneration updates
  -- this row in place and points it at a new content-addressed file.
  unique (source_type, source_id, variant, locale)
);

create index if not exists tts_audio_lookup on public.tts_audio (source_type, source_id);
create index if not exists tts_audio_status on public.tts_audio (status);
create index if not exists tts_audio_hash on public.tts_audio (content_hash);
-- Supports the client's "give me every ready clip for these vocabulary ids".
create index if not exists tts_audio_ready
  on public.tts_audio (source_type, locale, source_id) where status = 'ready';

-- ---------------------------------------------------------------------------
-- Generation jobs
-- ---------------------------------------------------------------------------
-- Durable, idempotent, restart-safe work items. The CLI is the worker; this
-- table is what makes a killed run resumable and a failed clip retryable.
create table if not exists public.tts_jobs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,

  source_type text not null check (source_type in ('vocabulary', 'story_utterance')),
  source_id uuid not null,
  variant text not null,
  locale text not null default 'zh-CN',
  content_hash text,                         -- expected hash, known at planning time

  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed', 'skipped', 'stale', 'needs_review')),
  attempts int not null default 0,
  max_attempts int not null default 3,

  -- Cost accounting, so a paid run is auditable without storing any secret.
  request_count int not null default 0,
  character_count int not null default 0,

  error_code text,
  error_message text,

  claimed_by text,                           -- opaque worker id (hostname + pid)
  claimed_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tts_jobs_batch on public.tts_jobs (batch_id);
create index if not exists tts_jobs_status on public.tts_jobs (status);
-- At most ONE live job per thing-said. Two concurrent CLI runs cannot queue the
-- same clip twice, and a duplicate insert fails loudly instead of double-billing.
create unique index if not exists tts_jobs_active_unique
  on public.tts_jobs (source_type, source_id, variant, locale)
  where status in ('pending', 'processing');

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
drop trigger if exists tts_audio_touch on public.tts_audio;
create trigger tts_audio_touch before update on public.tts_audio
  for each row execute function public.tts_touch_updated_at();

drop trigger if exists tts_overrides_touch on public.tts_pronunciation_overrides;
create trigger tts_overrides_touch before update on public.tts_pronunciation_overrides
  for each row execute function public.tts_touch_updated_at();

drop trigger if exists tts_jobs_touch on public.tts_jobs;
create trigger tts_jobs_touch before update on public.tts_jobs
  for each row execute function public.tts_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Reads are open to signed-in learners (they need the storage path to play a
-- clip); WRITES have no policy at all, so only the service key used by the
-- generation CLI can create or change a row. Same stance as `vocabulary`.
alter table public.tts_audio enable row level security;
alter table public.tts_pronunciation_overrides enable row level security;
alter table public.tts_jobs enable row level security;

drop policy if exists "authenticated can read ready tts_audio" on public.tts_audio;
create policy "authenticated can read ready tts_audio" on public.tts_audio
  for select to authenticated using (status = 'ready');

-- Admins see every row, including failures, for the review surface.
drop policy if exists "admins can read all tts_audio" on public.tts_audio;
create policy "admins can read all tts_audio" on public.tts_audio
  for select to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

drop policy if exists "authenticated can read tts overrides" on public.tts_pronunciation_overrides;
create policy "authenticated can read tts overrides" on public.tts_pronunciation_overrides
  for select to authenticated using (true);

drop policy if exists "admins can read tts_jobs" on public.tts_jobs;
create policy "admins can read tts_jobs" on public.tts_jobs
  for select to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- ---------------------------------------------------------------------------
-- Job claiming
-- ---------------------------------------------------------------------------
-- Atomically hand a worker up to p_limit jobs. `for update skip locked` is what
-- makes two concurrent runs safe: neither can claim the same row, and neither
-- blocks the other.
--
-- p_stale_after also reclaims jobs left in 'processing' by a run that was
-- killed - without it, a crash would strand work forever.
create or replace function public.tts_claim_jobs(
  p_batch_id uuid,
  p_worker text,
  p_limit int default 20,
  p_stale_after interval default interval '30 minutes'
)
returns setof public.tts_jobs
language sql
volatile
security definer
set search_path = public
as $$
  update public.tts_jobs j
  set status = 'processing',
      claimed_by = p_worker,
      claimed_at = now(),
      started_at = coalesce(j.started_at, now()),
      attempts = j.attempts + 1
  where j.id in (
    select c.id
    from public.tts_jobs c
    where c.batch_id = p_batch_id
      and (
        c.status = 'pending'
        or (c.status = 'processing' and c.claimed_at < now() - p_stale_after)
      )
      and c.attempts < c.max_attempts
    order by c.created_at
    limit greatest(1, least(p_limit, 200))
    for update skip locked
  )
  returning j.*;
$$;

-- Only the service role runs generation. No grant to `authenticated`.
revoke all on function public.tts_claim_jobs(uuid, text, int, interval) from public;
revoke all on function public.tts_claim_jobs(uuid, text, int, interval) from anon;
revoke all on function public.tts_claim_jobs(uuid, text, int, interval) from authenticated;

notify pgrst, 'reload schema';
