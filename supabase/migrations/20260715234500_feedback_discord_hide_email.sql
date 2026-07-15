-- Privacy fix: don't expose the submitter's email in the Discord #feedback-feed
-- card. Show the user_id instead — you can look the person up in the feedback /
-- auth tables when you need to follow up. The email stays only in Supabase.
--
-- Replaces the function body from 20260715230000_feedback_discord_webhook.sql;
-- the trigger itself is unchanged.

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
    return new;
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
      'footer', jsonb_build_object('text', 'User ' || coalesce(new.user_id::text, 'anonymous'))
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
