-- Lightweight, privacy-friendly product analytics: one append-only event log.
-- Collects LEARNING-JOURNEY events (funnel steps, session metrics), never
-- personal text: no story contents, typed answers, or email addresses. `props`
-- is a small JSON bag of counts / enums / ids only.
--
-- Apply in the Supabase SQL editor.

create table if not exists public.analytics_events (
  id          bigint generated always as identity primary key,
  -- Null for pre-signup funnel steps (Landing viewed / Signup started), else
  -- the signed-in user. `set null` keeps the funnel intact if an account is deleted.
  user_id     uuid references auth.users(id) on delete set null,
  session_id  text,                 -- per app-load id (client-generated, not a login session)
  name        text not null,        -- event name, e.g. 'onboarding_completed'
  language    text,                 -- 'chinese' | 'japanese' | 'russian' | null
  level       int,                  -- current track level, or null
  app_version text,                 -- build sha, so events can be attributed to a release
  props       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- Dashboard query patterns: by name over time, by user for retention, by session.
create index if not exists analytics_events_name_created_idx on public.analytics_events (name, created_at);
create index if not exists analytics_events_user_created_idx on public.analytics_events (user_id, created_at);
create index if not exists analytics_events_session_idx on public.analytics_events (session_id);

alter table public.analytics_events enable row level security;

-- Append-only for clients. Signed-in users may insert rows attributed to
-- themselves; signed-out clients (using the anon key) may insert user_id-null
-- events so the top of the funnel (Landing -> Signup) is measurable. No client
-- SELECT/UPDATE/DELETE — dashboards read with the service role.
--
-- Trade-off: because the anon key is public, anonymous rows are effectively
-- world-insertable. That is acceptable for product analytics (filter/segment in
-- the dashboard); it never exposes user data and cannot modify existing rows.
drop policy if exists "analytics insert own or anon" on public.analytics_events;
create policy "analytics insert own or anon"
  on public.analytics_events
  for insert
  with check (user_id is null or auth.uid() = user_id);

notify pgrst, 'reload schema';
