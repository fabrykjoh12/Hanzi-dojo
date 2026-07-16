-- Public story links: an anon-callable, security-definer read of ONE published
-- story plus its language's active vocabulary pool. RLS on stories/vocabulary
-- stays locked to authenticated users; this function is the only anon door, and
-- it can only ever return published-story content (never user data, never an
-- unpublished row). Mirrors the admin-dashboard RPC pattern.

create or replace function public.public_story(p_story_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', s.id,
    'title', s.title,
    'language', s.language,
    'system', s.system,
    'level', s.level,
    'image_path', s.image_path,
    'content', s.content,
    'english_content', s.english_content,
    'vocab_pool', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id,
        'word', v.word,
        'reading', v.reading,
        'meaning', v.meaning,
        'level', v.level,
        'sort_order', v.sort_order
      ))
      from public.vocabulary v
      where v.language = s.language
        and v.system = s.system
        and v.is_active = true
        -- Data minimization: an anon caller only needs the vocab a reader of
        -- THIS story could know (levels up to the story's own). Capping here
        -- keeps the computed % identical (words above the story level can't be
        -- "known" by any level chip and don't occur in an in-level story) while
        -- not exposing the whole language's word list through one shared link.
        and v.level <= s.level
    ), '[]'::jsonb)
  )
  from public.stories s
  where s.id = p_story_id
    and s.is_published = true;
$$;

-- Only the function runs as its owner; lock down who may call it.
revoke all on function public.public_story(uuid) from public;
grant execute on function public.public_story(uuid) to anon, authenticated;

-- Refresh PostgREST's schema cache so the RPC is callable immediately after
-- apply (otherwise the first /rest/v1/rpc/public_story call may 404 until the
-- cache refreshes). Matches the pattern in the other recent migrations.
notify pgrst, 'reload schema';
