-- Opt-in daily review reminder (product review item #16): Web Push
-- subscriptions + a per-profile schedule. Sending is done by a scheduled
-- GitHub Action (send-review-reminders.mjs), not a Supabase Edge Function —
-- this repo has no Supabase CLI/functions setup, and a plain Node script on
-- an hourly cron is simpler to operate and verify.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "users can read own push subscriptions"
on public.push_subscriptions
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "users can insert own push subscriptions"
on public.push_subscriptions
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "users can delete own push subscriptions"
on public.push_subscriptions
for delete to authenticated
using ((select auth.uid()) = user_id);

-- src/push.js upserts on the unique `endpoint`; PostgREST turns that into
-- INSERT ... ON CONFLICT DO UPDATE, whose UPDATE branch needs its own policy
-- (re-enabling reminders reuses the browser's existing subscription, so the
-- write hits the conflict path).
create policy "users can update own push subscriptions"
on public.push_subscriptions
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- reminder_hour_utc is a plain 0-23 hour, not a full timezone — the Settings
-- picker converts the user's local hour choice to UTC at save time, so this
-- can drift by an hour across a DST change. Acceptable for a v1.
alter table public.profiles add column if not exists reminder_enabled boolean not null default false;
alter table public.profiles add column if not exists reminder_hour_utc smallint;

notify pgrst, 'reload schema';
