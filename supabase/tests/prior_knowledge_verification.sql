-- Database integration test: a claim's first calibration grade is atomic.
--
-- Run this against a database that already has BOTH prior-knowledge migrations
-- applied (20260822160000 + 20260822170000):
--
--   psql "$DATABASE_URL" -f supabase/tests/prior_knowledge_verification.sql
--
-- or paste it into the Supabase SQL editor. The whole file runs inside one
-- transaction and ends in ROLLBACK, so it writes nothing — it can safely be run
-- against production to confirm a deploy.
--
-- WHY THIS TEST EXISTS. cards_unverified_claim_is_inert says an unverified
-- claim may carry no scheduler state. A first calibration grade changes exactly
-- those fields, so unless grade_card also stamps verified_at IN THE SAME
-- STATEMENT, Postgres rejects the write and every calibration check fails. That
-- was the real state of the code before 20260822170000; this test is what
-- proves it stays fixed. A JS fake cannot prove it, because the constraint
-- lives in the database.
--
-- What it asserts, for BOTH calibration outcomes:
--   * the graded write succeeds atomically through the production RPC
--   * reps = 1                       (exactly one genuine observation)
--   * verified_at is set             (the claim is now backed by evidence)
--   * prior_known_at / prior_source survive  (provenance is never overwritten)
--   * exactly one review_log exists
-- and, for a grade that fails partway:
--   * the card is untouched — reps 0, verified_at still NULL, state 'new'
--     (a failure can never leave a claim marked verified with no review)
--
-- "Verification" means we observed the learner, not that they were correct:
-- Again verifies a claim just as Easy does — it verifies that the claim was
-- wrong, which is knowledge too.

begin;

create temp table pk_test_results(n int, assertion text, result text, ok boolean) on commit drop;

do $$
declare
  v_user uuid; v_v1 uuid; v_v2 uuid; v_v3 uuid; v_card uuid;
  r jsonb; c record; n int;
begin
  select id into v_user from public.profiles limit 1;
  if v_user is null then
    insert into pk_test_results values (0, 'a profile exists to test with', 'NONE', false);
    return;
  end if;
  -- grade_card trusts auth.uid(); impersonate the chosen user for this tx only.
  perform set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  select v.id into v_v1 from public.vocabulary v
    where not exists (select 1 from public.cards c2 where c2.user_id = v_user and c2.vocab_id = v.id) limit 1;
  select v.id into v_v2 from public.vocabulary v
    where v.id <> v_v1 and not exists (select 1 from public.cards c2 where c2.user_id = v_user and c2.vocab_id = v.id) limit 1;
  select v.id into v_v3 from public.vocabulary v
    where v.id not in (v_v1, v_v2) and not exists (select 1 from public.cards c2 where c2.user_id = v_user and c2.vocab_id = v.id) limit 1;

  -- ── 1. An inert claim can be written ────────────────────────────────────
  insert into public.cards (user_id, vocab_id, state, learned, is_easy, stability, difficulty,
                            reps, lapses, last_review, due_at, prior_known_at, prior_source, verified_at)
  values (v_user, v_v1, 'new', false, false, null, null, 0, 0, null, now(),
          now() - interval '1 hour', 'placement', null)
  returning id into v_card;
  insert into pk_test_results values (1, 'an inert claim can be written', 'OK', true);

  -- ── 2. "I knew it" → canonical Easy, through the production RPC ─────────
  r := public.grade_card(
        v_v1,
        jsonb_build_object('state','review','interval_days',8,'due_at',(now()+interval '8 days')::text,
          'is_easy',true,'learned',true,'stability',8.2956,'difficulty',1,'reps',1,'lapses',0,
          'last_review',now()::text,'scheduled_days',8,'elapsed_days',0,'learning_step',0),
        v_card,
        jsonb_build_object('grade',3,'previous_state','new','next_state','review'),
        null, gen_random_uuid());
  select * into c from public.cards where id = v_card;
  select count(*) into n from public.review_logs where card_id = v_card;

  insert into pk_test_results values (2, 'Easy: RPC returned a card id', coalesce(r->>'card_id','NULL'), r->>'card_id' is not null);
  insert into pk_test_results values (3, 'Easy: reps = 1', c.reps::text, c.reps = 1);
  insert into pk_test_results values (4, 'Easy: verified_at is set', coalesce(c.verified_at::text,'NULL'), c.verified_at is not null);
  insert into pk_test_results values (5, 'Easy: prior_known_at preserved', coalesce(c.prior_known_at::text,'LOST'), c.prior_known_at is not null);
  insert into pk_test_results values (6, 'Easy: prior_source preserved', coalesce(c.prior_source,'LOST'), c.prior_source = 'placement');
  insert into pk_test_results values (7, 'Easy: state is review', c.state, c.state = 'review');
  insert into pk_test_results values (8, 'Easy: exactly one review_log', n::text, n = 1);

  -- ── 3. "Didn't know it" → canonical Again. Also verification. ───────────
  insert into public.cards (user_id, vocab_id, state, learned, is_easy, stability, difficulty,
                            reps, lapses, last_review, due_at, prior_known_at, prior_source, verified_at)
  values (v_user, v_v2, 'new', false, false, null, null, 0, 0, null, now(),
          now() - interval '1 hour', 'paste', null)
  returning id into v_card;
  r := public.grade_card(
        v_v2,
        jsonb_build_object('state','learning','interval_days',0,'due_at',now()::text,
          'is_easy',false,'learned',false,'stability',0.212,'difficulty',6.41,'reps',1,'lapses',0,
          'last_review',now()::text,'scheduled_days',0,'elapsed_days',0,'learning_step',0),
        v_card,
        jsonb_build_object('grade',0,'previous_state','new','next_state','learning'),
        null, gen_random_uuid());
  select * into c from public.cards where id = v_card;
  select count(*) into n from public.review_logs where card_id = v_card;

  insert into pk_test_results values (9,  'Again: reps = 1', c.reps::text, c.reps = 1);
  insert into pk_test_results values (10, 'Again: verified_at is set (a refuted claim is still observed)', coalesce(c.verified_at::text,'NULL'), c.verified_at is not null);
  insert into pk_test_results values (11, 'Again: state is learning', c.state, c.state = 'learning');
  insert into pk_test_results values (12, 'Again: exactly one review_log', n::text, n = 1);

  -- ── 4. A grade that fails partway leaves NOTHING behind ─────────────────
  insert into public.cards (user_id, vocab_id, state, learned, is_easy, stability, difficulty,
                            reps, lapses, last_review, due_at, prior_known_at, prior_source, verified_at)
  values (v_user, v_v3, 'new', false, false, null, null, 0, 0, null, now(),
          now() - interval '1 hour', 'checklist', null)
  returning id into v_card;
  begin
    -- grade 99 violates review_logs' own CHECK, so the log insert fails AFTER
    -- the card update — the exact interleaving that could strand a claim.
    r := public.grade_card(
          v_v3,
          jsonb_build_object('state','review','reps',1,'stability',8.3,'difficulty',1,
            'learned',true,'is_easy',true,'last_review',now()::text),
          v_card,
          jsonb_build_object('grade',99,'previous_state','new','next_state','review'),
          null, null);
    insert into pk_test_results values (13, 'a failing grade raises', 'DID NOT RAISE', false);
  exception when others then
    insert into pk_test_results values (13, 'a failing grade raises', substr(SQLERRM, 1, 50), true);
  end;
  select * into c from public.cards where id = v_card;
  insert into pk_test_results values (14, 'after failure: reps still 0', coalesce(c.reps,0)::text, coalesce(c.reps,0) = 0);
  insert into pk_test_results values (15, 'after failure: verified_at still NULL', coalesce(c.verified_at::text,'NULL'), c.verified_at is null);
  insert into pk_test_results values (16, 'after failure: state still new', c.state, c.state = 'new');
end $$;

select n, assertion, result, case when ok then 'PASS' else 'FAIL' end as status
from pk_test_results order by n;

select count(*) filter (where not ok) as failures,
       case when count(*) filter (where not ok) = 0 then 'ALL PASS' else 'FAILURES PRESENT' end as verdict
from pk_test_results;

rollback;
