-- Replace the complete authored comprehension set for one story atomically.
-- An upsert alone cannot remove a question deleted from a manifest; doing the
-- delete and inserts inside one function means a malformed replacement rolls
-- back instead of leaving the story with a partial or empty quiz.
create or replace function public.replace_story_questions(
  p_story_id uuid,
  p_questions jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_questions is null or jsonb_typeof(p_questions) <> 'array' then
    raise exception 'p_questions must be a JSON array';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_questions) as item
    where jsonb_typeof(item) <> 'object'
       or nullif(btrim(item->>'question'), '') is null
       or case
            when coalesce(jsonb_typeof(item->'options'), '') <> 'array' then true
            when jsonb_array_length(item->'options') <> 4 then true
            else exists (
              select 1
              from jsonb_array_elements(item->'options') as authored_option
              where jsonb_typeof(authored_option) <> 'string'
                 or nullif(btrim(authored_option #>> '{}'), '') is null
            )
          end
       or coalesce(item->>'correct_index', '') !~ '^[0-3]$'
  ) then
    raise exception 'each question needs text, four options, and a correct_index from 0 to 3';
  end if;

  delete from public.story_questions where story_id = p_story_id;

  insert into public.story_questions (
    story_id,
    question_number,
    question,
    options,
    correct_index
  )
  select
    p_story_id,
    ordinality::integer,
    item->>'question',
    array(select jsonb_array_elements_text(item->'options')),
    (item->>'correct_index')::integer
  from jsonb_array_elements(p_questions) with ordinality as authored(item, ordinality);

  v_count := jsonb_array_length(p_questions);
  return v_count;
end;
$$;

revoke all on function public.replace_story_questions(uuid, jsonb) from public;
revoke all on function public.replace_story_questions(uuid, jsonb) from anon;
revoke all on function public.replace_story_questions(uuid, jsonb) from authenticated;
grant execute on function public.replace_story_questions(uuid, jsonb) to service_role;

comment on function public.replace_story_questions(uuid, jsonb) is
  'Atomically replaces one story''s complete authored comprehension-question set.';
