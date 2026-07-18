-- Public reading assessment: an anon-callable, security-definer read of ONE
-- language's active vocabulary (no user data), for building the signed-out quiz
-- on /how-much-can-you-read. RLS on vocabulary stays authenticated-only; this is
-- the only anon door and it can only ever return active dictionary rows.
-- Mirrors the public_story data-minimization pattern.
create or replace function public.public_assessment_vocab(p_language text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id,
    'word', v.word,
    'reading', v.reading,
    'meaning', v.meaning,
    'level', v.level,
    'sort_order', v.sort_order
  ) order by v.level, v.sort_order), '[]'::jsonb)
  from public.vocabulary v
  where v.language = p_language
    and v.is_active = true;
$$;

-- Only the function runs as its owner; lock down who may call it.
revoke all on function public.public_assessment_vocab(text) from public;
grant execute on function public.public_assessment_vocab(text) to anon, authenticated;

-- Refresh PostgREST's schema cache so the RPC is callable immediately after apply.
notify pgrst, 'reload schema';
