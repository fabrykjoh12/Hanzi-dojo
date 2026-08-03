-- Native push notifications (Capacitor app). @capacitor/push-notifications
-- registers the device with FCM (Android) or APNs (iOS) and hands back a
-- device token — there's no endpoint/p256dh/auth triple the way Web Push
-- has, so push_subscriptions needs a second shape alongside the existing
-- Web Push one, distinguished by `platform`.
--
-- NOT YET APPLIED — written for review per the task's explicit instruction
-- to show this migration and wait for approval before running it. Once
-- approved: `supabase db push` / apply_migration.

alter table public.push_subscriptions
  add column if not exists platform text not null default 'web';

alter table public.push_subscriptions
  add constraint push_subscriptions_platform_check
  check (platform in ('web', 'ios', 'android'));

alter table public.push_subscriptions
  add column if not exists device_token text;

-- endpoint/p256dh/auth are Web-Push-only going forward; native rows leave
-- them null.
alter table public.push_subscriptions alter column endpoint drop not null;
alter table public.push_subscriptions alter column p256dh drop not null;
alter table public.push_subscriptions alter column auth drop not null;

-- Postgres unique constraints treat NULLs as distinct, so this only ever
-- rejects a genuine duplicate token, never two native rows in general.
create unique index if not exists push_subscriptions_device_token_key
  on public.push_subscriptions (device_token)
  where device_token is not null;

alter table public.push_subscriptions
  add constraint push_subscriptions_shape_check
  check (
    (platform = 'web' and endpoint is not null and p256dh is not null and auth is not null)
    or (platform in ('ios', 'android') and device_token is not null)
  );

notify pgrst, 'reload schema';
