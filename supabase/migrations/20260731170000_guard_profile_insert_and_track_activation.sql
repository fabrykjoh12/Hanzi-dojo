-- Close two server-side gaps in the public-product boundary. Idempotent.
--
-- 1) profiles.is_admin could be self-granted at INSERT time.
--    20260716120000_guard_is_admin_flag.sql installed guard_is_admin() as a
--    BEFORE UPDATE trigger, but profile rows are created client-side during
--    onboarding and there is no signup trigger on auth.users — so a freshly
--    signed-up user with no profiles row yet could
--      insert into profiles (id, is_admin) values (auth.uid(), true)
--    and the RLS insert policy ("with check (auth.uid() = id)") is column-blind.
--    The guard now covers INSERT too: an authenticated client may never create
--    a row with is_admin = true. Service role and dashboard SQL are unaffected
--    (current_user is not 'authenticated' there), so /make-admin still works.
--
-- 2) language_tracks accepted any allowed language from any client.
--    The product is Chinese-only publicly; the non-Chinese tracks are frozen —
--    they keep working for the accounts that already have them, but nothing may
--    activate a new one. That gate lived only in the client (PUBLIC_LANGUAGES
--    in src/languageTheme.js), so any authenticated user could insert a frozen
--    track from the browser console. A BEFORE INSERT OR UPDATE trigger now
--    enforces it at the data boundary:
--      * inserts of non-Chinese tracks by ordinary users are rejected
--      * changing an existing row's language to a non-Chinese one is rejected
--      * rows whose language is unchanged are untouched — the 15 existing
--        grandfathered tracks keep working exactly as before
--      * admins may still activate any defined language (internal QA), and the
--        service role (content scripts, migrations) is exempt entirely.
--    Un-pausing a language later means updating public_track_languages() here
--    alongside PUBLIC_LANGUAGES in src/languageTheme.js.

-- ── 1) is_admin guard covers INSERT as well as UPDATE ─────────────────────────

create or replace function public.guard_is_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      if new.is_admin then
        raise exception 'not authorized to modify is_admin';
      end if;
    elsif new.is_admin is distinct from old.is_admin then
      raise exception 'not authorized to modify is_admin';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_is_admin on public.profiles;
create trigger profiles_guard_is_admin
before insert or update on public.profiles
for each row
execute function public.guard_is_admin();

-- ── 2) frozen language tracks cannot be activated by ordinary clients ─────────

-- The server-side mirror of PUBLIC_LANGUAGES in src/languageTheme.js.
create or replace function public.public_track_languages()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['chinese'];
$$;

create or replace function public.guard_track_language()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Only constrain PostgREST clients; service role and SQL sessions pass.
  if current_user <> 'authenticated' then
    return new;
  end if;

  -- Updates that don't touch the language keep working — this is what keeps
  -- the grandfathered non-Chinese tracks alive (level changes, is_active, …).
  if tg_op = 'UPDATE' and new.language is not distinct from old.language then
    return new;
  end if;

  if new.language = any (public.public_track_languages()) then
    return new;
  end if;

  -- Admins may activate internal tracks (QA of frozen languages).
  if exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin
  ) then
    return new;
  end if;

  raise exception 'this language is not currently available';
end;
$$;

drop trigger if exists language_tracks_guard_language on public.language_tracks;
create trigger language_tracks_guard_language
before insert or update on public.language_tracks
for each row
execute function public.guard_track_language();
