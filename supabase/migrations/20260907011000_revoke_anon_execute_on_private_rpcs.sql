-- FAB-26 finding 7: anon holds EXECUTE on every SECURITY DEFINER RPC.
--
-- 18 advisor warnings, and harmless TODAY: each of these functions derives
-- identity from auth.uid(), which is null for anon, so they raise
-- 'Not authenticated' or return nothing. That is defence in depth resting on
-- one line inside each function. A future definer function that forgets the
-- check arrives reachable by anyone holding the publishable key, which ships in
-- every store build by design.
--
-- WHAT ANON ACTUALLY NEEDS, established from the code rather than assumed. The
-- signed-out surface is exactly three things (src/routes.js): the public story
-- route /read/<id>, the public reading test /how-much-can-you-read, and the
-- trust pages. src/PublicStory.jsx calls public_story; src/HowMuchCanYouRead.jsx
-- calls public_assessment_vocab; the trust pages call nothing. Every other RPC
-- call site in src/ sits behind App.jsx's `if (!session)` gate — including the
-- whole dictionary (src/dictSearch.js), which is reached only from signed-in
-- screens. So those two keep their anon grant and nothing else does.
--
-- assert_admin IS THE ONE THAT WOULD HAVE BEEN A NO-OP. Its proacl is
-- {=X/postgres, postgres=..., anon=..., authenticated=..., service_role=...} —
-- the bare `=X/` is a grant to PUBLIC, which anon inherits. Revoking from anon
-- alone leaves it callable. It is revoked from PUBLIC here, and from
-- authenticated too: it is only ever called from inside other definer
-- functions, which execute as their owner and do not consult the caller's
-- grant. No client calls it (no rpc('assert_admin') anywhere in src/).
--
-- NOT DONE HERE, deliberately: `alter default privileges in schema public
-- revoke execute on functions from anon`. It would stop the next definer
-- function arriving anon-executable, which is the actual recurring problem —
-- but it also silently breaks the next legitimately public RPC, and the failure
-- would appear as a signed-out screen that returns nothing rather than as an
-- error anyone connects to this migration. That trade deserves its own
-- decision. Recorded in docs/BACKLOG.md.
--
-- Idempotent: REVOKE on a privilege that is not held is not an error. Not
-- applied by this change.

do $$
declare
  -- Every SECURITY DEFINER function in public EXCEPT the two the signed-out
  -- app calls. Named one by one rather than "all functions in schema public":
  -- that form would also strip the trigger and trgm functions, and would sweep
  -- up a future public RPC without anyone noticing.
  r record;
  private_rpcs text[] := array[
    'admin_active_users', 'admin_client_errors', 'admin_funnel',
    'admin_overview', 'admin_retention', 'admin_story_stats',
    'assert_admin',
    'claim_story_reward',
    'dict_add_to_deck', 'dict_entry', 'dict_examples_for', 'dict_search',
    'dict_words_containing',
    'dojo_hq_members',
    'grade_card',
    'reset_current_language_progress', 'reset_language_progress'
  ];
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname = any (private_rpcs)
  loop
    execute format('revoke execute on function %s from anon', r.sig);

    -- assert_admin only: the PUBLIC grant is the one that matters, and
    -- authenticated has no reason to call it directly.
    if r.proname = 'assert_admin' then
      execute format('revoke execute on function %s from public', r.sig);
      execute format('revoke execute on function %s from authenticated', r.sig);
    end if;
  end loop;
end
$$;

-- The two that stay. Stated as explicit grants rather than left implicit, so a
-- later reader can see this migration decided about them rather than missed
-- them, and so re-running it after a wider revoke restores the public surface.
grant execute on function public.public_story(uuid) to anon;
grant execute on function public.public_assessment_vocab(text) to anon;
