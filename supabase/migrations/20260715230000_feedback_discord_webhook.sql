-- In-app feedback → Discord.
-- When a row is inserted into public.feedback (the in-app Feedback widget),
-- post a branded embed to the Discord #feedback-feed channel via a webhook.
--
-- SETUP (run once in the Supabase SQL editor, then apply this migration):
--   1. Enable the pg_net extension:  Database → Extensions → search "pg_net" → enable.
--      (or it's created below if you have permission.)
--   2. Store the Discord webhook URL as a Vault secret so it's never in git:
--        select vault.create_secret(
--          'https://discord.com/api/webhooks/XXXX/YYYY',  -- your #feedback-feed webhook
--          'discord_feedback_webhook'
--        );
--      To rotate it later: delete the old secret and create it again with the same name.
--
-- If the secret is missing, the trigger no-ops (inserts still succeed).

create extension if not exists pg_net;

create or replace function public.notify_discord_feedback()
returns trigger
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  webhook text;
  payload jsonb;
begin
  select decrypted_secret into webhook
  from vault.decrypted_secrets
  where name = 'discord_feedback_webhook'
  limit 1;

  if webhook is null or webhook = '' then
    return new;  -- not configured yet; do nothing
  end if;

  payload := jsonb_build_object(
    'embeds', jsonb_build_array(jsonb_build_object(
      'title', '📥 New ' || coalesce(new.category, 'feedback'),
      'description', left(coalesce(new.message, '(no message)'), 3900),
      'color', 12073508,  -- Hanzi Dojo vermillion #B83A24
      'fields', jsonb_build_array(
        jsonb_build_object('name', 'Page',     'value', coalesce(new.page, '—'),     'inline', true),
        jsonb_build_object('name', 'Language', 'value', coalesce(new.language, '—'), 'inline', true)
      ),
      'footer', jsonb_build_object('text', coalesce(new.email, 'anonymous'))
    ))
  );

  perform net.http_post(
    url     := webhook,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := payload
  );

  return new;
end;
$$;

drop trigger if exists on_feedback_notify_discord on public.feedback;
create trigger on_feedback_notify_discord
  after insert on public.feedback
  for each row execute function public.notify_discord_feedback();
