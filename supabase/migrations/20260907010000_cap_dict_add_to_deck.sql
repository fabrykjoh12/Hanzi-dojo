-- FAB-26 finding 3: dict_add_to_deck lets any authenticated user append rows to
-- the GLOBAL vocabulary table, without limit.
--
-- vocabulary has exactly one policy and it is a SELECT, so a client has no
-- INSERT path of its own. This SECURITY DEFINER function bypasses that: when no
-- curriculum word matches the dictionary entry, it inserts a new level-NULL row
-- that every user then reads. There is no rate limit and no per-user cap, so a
-- script calling it once per dict_entries row — 122,981 of them — appends that
-- many rows to a table the whole product reads. CLAUDE.md §7.1 forbids DELETING
-- vocabulary, so cleanup would be is_active = false on each one: durable
-- pollution. Three level-NULL rows exist today, so the path is live.
--
-- Content injection is NOT possible and this migration does not pretend
-- otherwise: every field is copied from the curated dict_entries row, and
-- ownership of the resulting card is correctly auth.uid().
--
-- THREE CHANGES, and what each is worth:
--
--   1. A per-caller rate limit. Counted from the caller's OWN cards on
--      level-NULL vocabulary in the last 24 hours — attributable without
--      adding a created_by column to vocabulary, which would publish "user X
--      added word Y" to every reader of a world-readable table. It is a rate
--      limit, not a wall: 200 a day is far above any real learner's dictionary
--      use and far below 122,981, and a determined account still accumulates
--      over time. The real fix for CLEANUP is provenance the cap cannot give —
--      recorded in docs/BACKLOG.md rather than smuggled in here.
--
--   2. A partial unique index on the dictionary-sourced rows, so two callers
--      adding the same new word at once cannot both insert it. The existing
--      SELECT-then-INSERT is a READ COMMITTED race today. The index is PARTIAL
--      twice over, both deliberate: (language, system, word) has 29 duplicate
--      groups across the whole table (22 among active rows), so a global unique
--      index would fail to build — among level-NULL rows there are 0, verified
--      live before this was written; and is_active is excluded so that §7.1
--      cleanup, which deactivates rather than deletes, leaves a word addable
--      again instead of permanently blocked.
--
--   3. It stops writing ease_factor, which CLAUDE.md §10 forbids. The column is
--      NOT NULL DEFAULT 2.50, so omitting it writes the identical row.
--
-- Idempotent. Not applied by this change.

-- 2. Close the duplicate race first, so the function below can rely on it.
create unique index if not exists vocabulary_dictionary_word_unique
  on public.vocabulary (language, system, word)
  where level is null and is_active;

comment on index public.vocabulary_dictionary_word_unique is
  'Dictionary-sourced rows (level IS NULL) are one ACTIVE row per '
  '(language, system, word). Partial twice over: curriculum rows legitimately '
  'duplicate (29 such groups exist, so a global unique index cannot build), and '
  'is_active is excluded so §7.1 cleanup — deactivate, never delete — leaves the '
  'word addable again rather than permanently blocked. FAB-26 finding 3.';

-- 1 + 3. The function.
create or replace function public.dict_add_to_deck(
  p_dict_entry_id uuid,
  p_language text,
  p_system text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  -- Far above a real learner's dictionary use, far below the size of
  -- dict_entries. See the header: a rate limit, not a wall.
  c_daily_cap constant int := 200;

  v_user_id uuid := auth.uid();
  v_entry public.dict_entries;
  v_vocab_id uuid;
  v_match_level int;
  v_source text;
  v_meaning text;
  v_already boolean := false;
  v_has_track boolean;
  v_recent_adds int;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Caller must own an active track for this language/system.
  select exists (
    select 1 from public.language_tracks
    where user_id = v_user_id and language = p_language
      and system = p_system and is_active = true
  ) into v_has_track;
  if not v_has_track then
    raise exception 'Language track not found';
  end if;

  -- The cap, checked BEFORE any write. A caller at the cap is refused even for
  -- a word already in their deck, which writes nothing — accepted, because
  -- reaching it takes 200 dictionary adds inside 24 hours.
  select count(*) into v_recent_adds
  from public.cards c
  join public.vocabulary v on v.id = c.vocab_id
  where c.user_id = v_user_id
    and v.level is null
    and c.created_at > now() - interval '24 hours';

  if v_recent_adds >= c_daily_cap then
    raise exception 'Dictionary add limit reached — try again tomorrow';
  end if;

  select * into v_entry from public.dict_entries where id = p_dict_entry_id;
  if not found then
    raise exception 'Dictionary entry not found';
  end if;

  if v_entry.language <> p_language then
    raise exception 'Language mismatch';
  end if;

  -- Existing curriculum word for this simplified form?
  select id, level into v_vocab_id, v_match_level
  from public.vocabulary
  where language = p_language and system = p_system
    and word = v_entry.simplified and is_active = true
  order by level nulls last
  limit 1;

  if v_vocab_id is not null then
    v_source := case when v_match_level is null then 'dictionary' else 'curriculum' end;
  else
    -- New dictionary-sourced row (NULL level). meaning is required NOT NULL.
    v_meaning := coalesce(
      (select string_agg(value::text, '; ')
         from jsonb_array_elements_text(v_entry.definitions) as t(value)),
      v_entry.simplified);

    -- ON CONFLICT against the partial index above: a concurrent caller adding
    -- the same word wins the insert, and this one adopts their row instead of
    -- creating a second. RETURNING yields nothing on conflict, hence the
    -- re-select. ease_factor is deliberately absent (CLAUDE.md §10).
    insert into public.vocabulary
      (language, system, level, sort_order, word, reading, reading_plain, meaning, is_active)
    values
      (p_language, p_system, null, 0, v_entry.simplified, v_entry.pinyin, v_entry.pinyin_plain, v_meaning, true)
    on conflict (language, system, word) where level is null and is_active do nothing
    returning id into v_vocab_id;

    if v_vocab_id is null then
      select id into v_vocab_id
      from public.vocabulary
      where language = p_language and system = p_system
        and word = v_entry.simplified and level is null and is_active;
    end if;

    v_source := 'dictionary';
  end if;

  -- Insert the card if the user doesn't already have one for this vocab.
  if exists (select 1 from public.cards where user_id = v_user_id and vocab_id = v_vocab_id) then
    v_already := true;
  else
    insert into public.cards (user_id, vocab_id, state, learning_step, due_at)
    values (v_user_id, v_vocab_id, 'new', 0, now());
  end if;

  return jsonb_build_object('vocab_id', v_vocab_id, 'source', v_source, 'already_in_deck', v_already);
end;
$function$;

comment on function public.dict_add_to_deck(uuid, text, text) is
  'Adds a dictionary entry to the caller''s deck, creating a level-NULL '
  'vocabulary row when no curriculum word matches. Rate-limited to 200 '
  'dictionary adds per caller per 24h (FAB-26 finding 3). Never writes '
  'ease_factor.';
