-- supabase/migrations/20260719130000_flashcard_anything.sql
-- "Flashcard anything": let a learner save any reference-dictionary word to their
-- FSRS deck. Non-curriculum words become dictionary-sourced vocabulary rows with
-- a NULL level (the sentinel meaning "not part of any graded level"), so they
-- enter spaced repetition but are excluded from level tests / curriculum flows
-- (which all filter on a concrete level). The privileged inserts run in a
-- security-definer RPC because `vocabulary` has no INSERT policy.

-- 1) Allow NULL level for dictionary-sourced words; keep 1..9 valid otherwise.
alter table public.vocabulary alter column level drop not null;
alter table public.vocabulary drop constraint if exists vocabulary_level_check;
alter table public.vocabulary add constraint vocabulary_level_check
  check (level is null or level between 1 and 9);

-- 2) Atomic add-to-deck. Matches the dict entry to an existing curriculum word
-- (same language/system/word) if one exists; otherwise inserts a dictionary-
-- sourced row (level NULL). Then inserts the card if absent. Idempotent.
create or replace function public.dict_add_to_deck(
  p_dict_entry_id uuid,
  p_language text,
  p_system text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_entry public.dict_entries;
  v_vocab_id uuid;
  v_source text;
  v_meaning text;
  v_already boolean := false;
  v_has_track boolean;
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

  select * into v_entry from public.dict_entries where id = p_dict_entry_id;
  if not found then
    raise exception 'Dictionary entry not found';
  end if;

  -- Existing curriculum word for this simplified form?
  select id into v_vocab_id
  from public.vocabulary
  where language = p_language and system = p_system
    and word = v_entry.simplified and is_active = true
  order by level nulls last
  limit 1;

  if v_vocab_id is not null then
    v_source := 'curriculum';
  else
    -- New dictionary-sourced row (NULL level). meaning is required NOT NULL.
    v_meaning := coalesce(
      (select string_agg(value::text, '; ')
         from jsonb_array_elements_text(v_entry.definitions) as t(value)),
      v_entry.simplified);
    insert into public.vocabulary
      (language, system, level, sort_order, word, reading, reading_plain, meaning, is_active)
    values
      (p_language, p_system, null, 0, v_entry.simplified, v_entry.pinyin, v_entry.pinyin_plain, v_meaning, true)
    returning id into v_vocab_id;
    v_source := 'dictionary';
  end if;

  -- Insert the card if the user doesn't already have one for this vocab.
  if exists (select 1 from public.cards where user_id = v_user_id and vocab_id = v_vocab_id) then
    v_already := true;
  else
    insert into public.cards (user_id, vocab_id, state, ease_factor, learning_step, due_at)
    values (v_user_id, v_vocab_id, 'new', 2.5, 0, now());
  end if;

  return jsonb_build_object('vocab_id', v_vocab_id, 'source', v_source, 'already_in_deck', v_already);
end;
$$;

revoke all on function public.dict_add_to_deck(uuid, text, text) from public;
grant execute on function public.dict_add_to_deck(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
