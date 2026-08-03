-- Chinese-only, for real: the Japanese and Russian tracks are no longer just
-- frozen (usable-but-no-new-content, per CLAUDE.md before this migration) —
-- their UI (Kana.jsx, Cyrillic.jsx, the language switcher entries) is being
-- removed from the app entirely in this same change. A profile still parked
-- on active_language = 'japanese' | 'russian' would otherwise land on a
-- screen that no longer exists the next time they open the app.
--
-- Per CLAUDE.md §7 (never delete language_tracks rows outside the reset RPC)
-- and the freeze's own precedent, this DEACTIVATES the frozen track rather
-- than deleting them — their level, cards, and review history are all left
-- exactly as they were, just no longer the active one. Every affected
-- profile is moved onto a working Chinese track: their existing one,
-- reactivated, or a fresh level-1 one if they never had Chinese.
--
-- Runs as a migration (service role / SQL session), so it isn't subject to
-- language_tracks_guard_language (20260731170000) — that trigger only
-- constrains PostgREST's 'authenticated' role.

do $$
declare
  r record;
begin
  for r in
    select id from public.profiles where active_language in ('japanese', 'russian')
  loop
    update public.language_tracks
    set is_active = false
    where user_id = r.id and language in ('japanese', 'russian') and is_active = true;

    if exists (select 1 from public.language_tracks where user_id = r.id and language = 'chinese') then
      update public.language_tracks
      set is_active = true
      where user_id = r.id and language = 'chinese';
    else
      insert into public.language_tracks (user_id, language, system, current_level, is_active)
      values (r.id, 'chinese', 'hsk_3', 1, true);
    end if;

    update public.profiles set active_language = 'chinese' where id = r.id;
  end loop;
end $$;
