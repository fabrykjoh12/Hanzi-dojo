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
--   1. TWO rate limits, and it needs both.
--
--      A per-caller one — 200 in 24 hours, counted from the caller's OWN cards
--      on level-NULL vocabulary. Attributable without adding a created_by
--      column to vocabulary, which would publish "user X added word Y" to
--      every reader of a world-readable table.
--
--      That limb ALONE IS RESETTABLE BY THE CALLER, and the first draft of
--      this migration claimed a bound it therefore did not have. `cards` has a
--      `for delete using (auth.uid() = user_id)` policy and the app itself
--      uses it, so the sequence is: 200 calls, one
--      `DELETE /rest/v1/cards?user_id=eq.me`, repeat — the 200 new GLOBAL
--      vocabulary rows stay, because §7.1 forbids deleting them, and the
--      counter is back to zero. reset_language_progress gives the same reset
--      through a supported RPC. A control counted from state the adversary
--      controls is not a control.
--
--      So the second limb counts what the caller CANNOT delete: rows in
--      `vocabulary` itself, level-NULL, created in the last 24 hours, across
--      everyone. 500 a day. Deactivating a row does not remove it, so this
--      counter only ever moves forward.
--
--      The tradeoff, stated: one abusive account can burn the global budget
--      and lock legitimate dictionary adds out for a day. That is accepted
--      deliberately — a burned day is recoverable and visible; permanently
--      polluted vocabulary is neither. With 3 level-NULL rows in existence
--      today, no real learner comes near 500.
--
--      It is still a brake and not a wall: 500 a day is bounded pollution, not
--      no pollution. The durable fix is provenance plus moderation, which the
--      cap cannot give — recorded in docs/BACKLOG.md rather than smuggled in
--      here.
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
--
-- The superseded index goes first: same key, no is_active limb, unapplied in
-- production but present in any environment applied in filename order. Leaving
-- it would break the deactivate-then-re-add path outright (see the header).
drop index if exists public.vocabulary_dict_word_uniq;

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
  -- The limb the caller cannot reset: new level-NULL vocabulary rows, from
  -- everyone, in the last 24 hours. Rows are never deleted (§7.1), so this
  -- counter only moves forward.
  c_global_daily_cap constant int := 500;
  -- Stable SQLSTATEs so the client can tell these apart from each other and
  -- from a network failure. Until they existed the 201st add of the day was
  -- indistinguishable from an outage (src/dictAddFeedback.js).
  --
  -- Three, not one, because they are three different things to say:
  --   PT429  your own daily limit — come back tomorrow.
  --   PT503  the SHARED daily brake — nothing to do with what you added, and
  --          telling a learner who has added nothing today that they have had
  --          "enough new words" is a false statement about their own behaviour.
  --   PT409  a lost insert race — retry now, it will work.
  --
  -- PT429 rather than an invented class: PostgREST maps SQLSTATE to HTTP status
  -- by class and honours a caller-chosen status only for the PTxxx form, so
  -- PT429 arrives as a real 429 while (say) HD429 falls through to 500 — which
  -- would log every capped add as a server error, the opposite of the point.
  c_limit_errcode constant text := 'PT429';
  c_busy_errcode constant text := 'PT503';

  v_user_id uuid := auth.uid();
  v_entry public.dict_entries;
  v_vocab_id uuid;
  v_match_level int;
  v_source text;
  v_meaning text;
  v_already boolean := false;
  v_has_track boolean;
  v_recent_adds int;
  v_recent_global int;
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
    raise exception 'Dictionary add limit reached — try again tomorrow'
      using errcode = c_limit_errcode;
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
    -- The global brake, checked only here: adopting a row that already exists
    -- costs the shared table nothing, and only this branch creates one.
    select count(*) into v_recent_global
    from public.vocabulary
    where level is null
      and created_at > now() - interval '24 hours';

    if v_recent_global >= c_global_daily_cap then
      raise exception 'The dictionary is not accepting new words right now — try again tomorrow'
        using errcode = c_busy_errcode;
    end if;

    -- New dictionary-sourced row (NULL level). meaning is required NOT NULL.
    v_meaning := coalesce(
      (select string_agg(value::text, '; ')
         from jsonb_array_elements_text(v_entry.definitions) as t(value)),
      v_entry.simplified);

    -- ON CONFLICT against the partial index above. Be exact about what this
    -- closes and what it does not, because the first draft of this comment
    -- claimed the whole race:
    --
    --   · Against a COMMITTED row, the conflict fires, RETURNING yields
    --     nothing, and the re-select adopts that row. No duplicate is ever
    --     created — which is the outcome the index exists for.
    --   · Against an UNCOMMITTED concurrent insert, DO NOTHING does not wait
    --     on the speculative-insertion lock; it skips. Under READ COMMITTED the
    --     re-select cannot see the uncommitted row either, so v_vocab_id stays
    --     null. That is a lost race, not a corruption, and it is raised as a
    --     retryable error below rather than left to violate cards.vocab_id NOT
    --     NULL with a message nobody can act on.
    --
    -- DO UPDATE would wait and return the row, closing that half too — at the
    -- cost of touching a shared vocabulary row (and its updated_at trigger) on
    -- every conflicting add, for a race that needs two learners adding the same
    -- brand-new dictionary word in the same instant. Not worth it.
    --
    -- ease_factor is deliberately absent (CLAUDE.md §10).
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

    if v_vocab_id is null then
      -- The lost-race branch described above. PT409 so PostgREST answers 409,
      -- and src/dictAddFeedback.js turns it into "try again" rather than the
      -- generic failure — an earlier version of this comment claimed the client
      -- could already tell them apart when nothing in src/ knew the code.
      raise exception 'That word is being added right now — try again'
        using errcode = 'PT409';
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
  'vocabulary row when no curriculum word matches. TWO rate limits (FAB-26 '
  'finding 3): 200 adds per caller per 24h, and 500 new level-NULL vocabulary '
  'rows per 24h across all callers — the second can refuse a caller who has '
  'added nothing today, and exists because the first counts the caller''s own '
  'cards, which the caller may delete. SQLSTATEs: PT429 the per-caller limit, '
  'PT503 the shared brake, PT409 a lost insert race (retryable). Never writes '
  'ease_factor.';

notify pgrst, 'reload schema';
