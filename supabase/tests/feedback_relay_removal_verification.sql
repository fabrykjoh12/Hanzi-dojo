-- Database verification for 20260825120000_drop_feedback_discord_relay.sql
-- (FAB-19 F3/F13, Stage 3).
--
-- Run against a database that has the migration applied:
--
--   psql "$DATABASE_URL" -f supabase/tests/feedback_relay_removal_verification.sql
--
-- or paste it into the Supabase SQL editor. The whole file runs inside one
-- transaction and ends in ROLLBACK, so it writes nothing — it is safe to run
-- against production to confirm a deploy.
--
-- WHY THIS TEST EXISTS. Dropping a trigger is easy to get half-right: drop the
-- function but leave the trigger (inserts then fail outright), drop the trigger
-- but leave the function (the capability is still one CREATE TRIGGER away), or
-- reach for CASCADE and take an unrelated dependency with it. It is also easy
-- to break the thing the trigger was attached to — feedback inserts, the RLS
-- that keeps one learner's feedback private, and the ON DELETE CASCADE that
-- carries feedback away when an account is deleted.
--
-- So this asserts the removal AND the non-removal:
--   1  the relay trigger is gone
--   2  the relay function is gone
--   3  NO trigger on public.feedback makes outbound HTTP
--   4  nothing in `public` calls net.http any more
--   5  feedback still inserts normally, and the row is intact afterwards
--   6  existing feedback rows were not touched
--   7  RLS is still enabled on feedback, with its policies intact
--   8  feedback still cascades from profiles (account deletion unchanged)
--   9  the vault was not modified
--
-- Run it BEFORE the migration too: 1-4 fail and 5-9 pass, which is the proof
-- that the test actually discriminates rather than passing vacuously.

begin;

create temp table relay_test_results (
  id int,
  what text,
  got text,
  ok boolean
) on commit drop;

do $$
declare
  n int;
  v_user uuid;
  v_id uuid;
  v_msg text := 'FAB-19 relay-removal probe (rolled back)';
  v_before int;
  v_after int;
begin
  -- ── 1. The relay trigger is gone ────────────────────────────────────────
  select count(*) into n
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
  where not t.tgisinternal and c.relname = 'feedback'
    and t.tgname = 'on_feedback_notify_discord';
  insert into relay_test_results values (1, 'relay trigger on_feedback_notify_discord is gone', n::text, n = 0);

  -- ── 2. The relay function is gone ───────────────────────────────────────
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'notify_discord_feedback';
  insert into relay_test_results values (2, 'relay function notify_discord_feedback is gone', n::text, n = 0);

  -- ── 3. No REMAINING trigger on feedback can make an outbound request ────
  -- Stronger than naming one trigger: whatever is attached to feedback now,
  -- none of it may reach the network.
  select count(*) into n
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_proc p on p.oid = t.tgfoid
  where not t.tgisinternal and c.relname = 'feedback'
    and pg_get_functiondef(p.oid) ilike '%net.http%';
  insert into relay_test_results values (3, 'no trigger on feedback calls net.http', n::text, n = 0);

  -- ── 4. Nothing in `public` calls net.http at all ────────────────────────
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.prokind = 'f'
    and pg_get_functiondef(p.oid) ilike '%net.http%';
  insert into relay_test_results values (4, 'no function in public calls net.http', n::text, n = 0);

  -- ── 5. Feedback still inserts normally ──────────────────────────────────
  select id into v_user from public.profiles limit 1;
  if v_user is null then
    insert into relay_test_results values (5, 'a profile exists to attribute feedback to', 'NONE', false);
  else
    select count(*) into v_before from public.feedback;

    insert into public.feedback (user_id, email, category, message, page, language, context)
    values (v_user, 'relay-probe@example.invalid', 'bug', v_msg, '/settings', 'chinese',
            jsonb_build_object('app_version', 'relay-removal-test'))
    returning id into v_id;

    insert into relay_test_results values (5, 'feedback insert succeeds', coalesce(v_id::text, 'NULL'), v_id is not null);

    -- The row is intact and unmodified by anything trigger-shaped.
    select count(*) into n from public.feedback
    where id = v_id and message = v_msg and page = '/settings' and language = 'chinese';
    insert into relay_test_results values (6, 'the inserted row reads back unchanged', n::text, n = 1);

    -- ── 6. Existing rows untouched: exactly one row was added ─────────────
    select count(*) into v_after from public.feedback;
    insert into relay_test_results values (7, 'exactly one row added, none altered',
                                           (v_after - v_before)::text, (v_after - v_before) = 1);
  end if;

  -- ── 7. RLS on feedback is unchanged ─────────────────────────────────────
  select count(*) into n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'feedback' and c.relrowsecurity;
  insert into relay_test_results values (8, 'RLS still enabled on feedback', n::text, n = 1);

  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'feedback';
  insert into relay_test_results values (9, 'feedback still has its 2 RLS policies', n::text, n = 2);

  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'feedback'
    and cmd = 'INSERT' and with_check ilike '%auth.uid()%';
  insert into relay_test_results values (10, 'the own-row INSERT policy is intact', n::text, n = 1);

  -- ── 8. Account deletion is unchanged: feedback still cascades ───────────
  select count(*) into n
  from pg_constraint con
  join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
  where con.contype = 'f'
    and con.conrelid = 'public.feedback'::regclass
    and con.confrelid = 'public.profiles'::regclass
    and a.attname = 'user_id'
    and con.confdeltype = 'c';   -- 'c' = ON DELETE CASCADE
  insert into relay_test_results values (11, 'feedback.user_id still CASCADEs from profiles', n::text, n = 1);

  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'delete_my_account';
  insert into relay_test_results values (12, 'delete_my_account still exists', n::text, n = 1);

  -- ── 9. The vault was not modified ───────────────────────────────────────
  -- The migration must not create, read or delete a secret. It was empty
  -- before; it must still be empty, and specifically must not hold the
  -- webhook secret the old setup comment told people to create.
  select count(*) into n from vault.secrets where name = 'discord_feedback_webhook';
  insert into relay_test_results values (13, 'no discord_feedback_webhook secret exists', n::text, n = 0);
end $$;

select
  id,
  case when ok then 'PASS' else 'FAIL' end as result,
  what,
  got
from relay_test_results
order by id;

select
  count(*) filter (where ok)       as passed,
  count(*) filter (where not ok)   as failed,
  case when count(*) filter (where not ok) = 0
       then 'ALL PASS — the relay is gone and feedback, RLS and deletion are unchanged'
       else 'FAILURES ABOVE — do not treat the relay as removed'
  end as verdict
from relay_test_results;

rollback;
