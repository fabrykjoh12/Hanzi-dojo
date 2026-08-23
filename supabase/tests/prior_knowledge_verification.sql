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
-- It also covers the failure modes found in review:
--   * CLOCK SKEW, CLIENT BEHIND — verified_at must be SERVER time. Deriving it
--     from the client's last_review let the client choose it outright.
--   * CLOCK SKEW, CLIENT AHEAD — the mirror image, and the reason there is NO
--     ordering constraint between verified_at and prior_known_at. The claim is
--     stamped by the DEVICE clock (priorKnownCardRow) and the verification by
--     the SERVER clock (grade_card's now()); a device running two hours fast
--     writes a claim dated in the server's future, and a genuine grade a second
--     later stamps verified_at BEFORE it. Section 7 proves that grade still
--     succeeds and that verified_at is server time, not the device's.
--   * COMPARE-AND-SWAP — the legacy migration's UPDATE must carry its own
--     precondition, so a concurrent genuine grade can never be overwritten.
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

-- ── 5. Clock skew: verified_at is SERVER-derived ────────────────────────────
do $$
declare
  v_user uuid; v_v uuid; v_card uuid; c record;
begin
  select id into v_user from public.profiles limit 1;
  if v_user is null then return; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);
  select v.id into v_v from public.vocabulary v
    where not exists (select 1 from public.cards c2 where c2.user_id = v_user and c2.vocab_id = v.id) limit 1;

  insert into public.cards (user_id, vocab_id, state, learned, is_easy, stability, difficulty,
                            reps, lapses, last_review, due_at, prior_known_at, prior_source, verified_at)
  values (v_user, v_v, 'new', false, false, null, null, 0, 0, null, now(), now(), 'placement', null)
  returning id into v_card;

  -- The client's clock is two hours BEHIND the server. Its last_review is
  -- therefore earlier than the claim it is verifying.
  begin
    perform public.grade_card(
      v_v,
      jsonb_build_object('state','review','interval_days',8,'due_at',(now()+interval '8 days')::text,
        'is_easy',true,'learned',true,'stability',8.2956,'difficulty',1,'reps',1,'lapses',0,
        'last_review',(now() - interval '2 hours')::text,
        'scheduled_days',8,'elapsed_days',0,'learning_step',0),
      v_card,
      jsonb_build_object('grade',3,'previous_state','new','next_state','review'),
      null, gen_random_uuid());
    insert into pk_test_results values (17, 'skewed client clock: the grade still succeeds', 'OK', true);
  exception when others then
    insert into pk_test_results values (17, 'skewed client clock: the grade still succeeds', substr(SQLERRM,1,60), false);
  end;

  select * into c from public.cards where id = v_card;
  -- Not an ordering INVARIANT — there is none, by design (see section 7). Here
  -- the claim happens to be stamped with server now(), so the order holds; what
  -- matters is that a claim behind the grade is fine.
  insert into pk_test_results values (18, 'skew: a claim made before the grade verifies cleanly',
    coalesce(c.verified_at::text,'NULL'), c.verified_at is not null and c.verified_at >= c.prior_known_at);
  insert into pk_test_results values (19, 'skew: last_review keeps the scheduler''s (earlier) value',
    coalesce(c.last_review::text,'NULL'), c.last_review < c.prior_known_at);
  insert into pk_test_results values (20, 'skew: verified_at is not the client timestamp',
    case when c.verified_at <> c.last_review then 'server-derived' else 'CLIENT STEERED IT' end,
    c.verified_at <> c.last_review);
end $$;

-- ── 6. Compare-and-swap protects a concurrent genuine grade ─────────────────
do $$
declare
  v_user uuid; v_v uuid; v_card uuid; c record; n int;
begin
  select id into v_user from public.profiles limit 1;
  if v_user is null then return; end if;
  select v.id into v_v from public.vocabulary v
    where not exists (select 1 from public.cards c2 where c2.user_id = v_user and c2.vocab_id = v.id) limit 1;

  -- A legacy seed row, exactly as production holds it.
  insert into public.cards (user_id, vocab_id, state, learned, is_easy, stability, difficulty,
                            reps, lapses, last_review, due_at, elapsed_days)
  values (v_user, v_v, 'review', true, false, 21, 5, 0, 0, now(), now(), 0)
  returning id into v_card;

  -- The learner grades it AFTER the migration read the world.
  update public.cards set state='review', reps=1, stability=22.4, difficulty=6.6, last_review=now()
   where id = v_card;

  -- The migration's CONDITIONAL update. One statement; the precondition rides
  -- in the WHERE, so there is no window between inspection and write.
  with cas as (
    update public.cards set
      state='new', learned=false, is_easy=false, stability=null, difficulty=null,
      last_review=null, reps=0, lapses=0, prior_known_at=now(), prior_source='legacy_claim'
    where id = v_card
      and state='review' and reps=0 and lapses=0 and elapsed_days=0
      and learned=true and is_easy=false
      and prior_known_at is null and verified_at is null
    returning id
  ) select count(*) into n from cas;
  insert into pk_test_results values (21, 'CAS refuses to overwrite a concurrent grade', n || ' rows', n = 0);

  select * into c from public.cards where id = v_card;
  insert into pk_test_results values (22, 'CAS: the learner''s grade survives intact',
    'reps=' || c.reps || ' state=' || c.state, c.reps = 1 and c.state = 'review');

  -- Put the row back to the seed shape; now the same CAS must fire.
  update public.cards set state='review', reps=0, stability=21, difficulty=5, learned=true,
    is_easy=false, lapses=0, elapsed_days=0, last_review=now() where id = v_card;
  with cas2 as (
    update public.cards set
      state='new', learned=false, is_easy=false, stability=null, difficulty=null,
      last_review=null, reps=0, lapses=0, prior_known_at=now(), prior_source='legacy_claim'
    where id = v_card
      and state='review' and reps=0 and lapses=0 and elapsed_days=0
      and learned=true and is_easy=false
      and prior_known_at is null and verified_at is null
    returning id
  ) select count(*) into n from cas2;
  insert into pk_test_results values (23, 'CAS applies when the row is unchanged', n || ' row', n = 1);
end $$;

-- ── 7. A DEVICE CLOCK RUNNING AHEAD of the server ───────────────────────────
-- The mirror of section 5, and the reason no ordering constraint exists.
--
-- prior_known_at is written client-side by knowledgeState.priorKnownCardRow(),
-- so a phone two hours fast stamps the claim two hours into the server's
-- future. The learner then calibrates it immediately and honestly, and
-- grade_card stamps verified_at with the SERVER's now() — which is BEFORE the
-- claim. If the database ordered these two columns, that genuine grade would be
-- rejected. It must not be.
--
-- Both calibration outcomes are covered: "I knew it" (Easy) and "Didn't know
-- it" (Again). Both are observations, so both verify.
do $$
declare
  v_user uuid; v_vE uuid; v_vA uuid; v_card uuid; c record; n int; v_claim timestamptz;
begin
  select id into v_user from public.profiles limit 1;
  if v_user is null then return; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);
  select v.id into v_vE from public.vocabulary v
    where not exists (select 1 from public.cards c2 where c2.user_id = v_user and c2.vocab_id = v.id) limit 1;
  select v.id into v_vA from public.vocabulary v
    where v.id <> v_vE and not exists (select 1 from public.cards c2 where c2.user_id = v_user and c2.vocab_id = v.id) limit 1;

  v_claim := now() + interval '2 hours';   -- the fast device's idea of "now"

  -- ── Easy ────────────────────────────────────────────────────────────────
  insert into public.cards (user_id, vocab_id, state, learned, is_easy, stability, difficulty,
                            reps, lapses, last_review, due_at, prior_known_at, prior_source, verified_at)
  values (v_user, v_vE, 'new', false, false, null, null, 0, 0, null, v_claim,
          v_claim, 'placement', null)
  returning id into v_card;

  begin
    perform public.grade_card(
      v_vE,
      jsonb_build_object('state','review','interval_days',8,'due_at',(now()+interval '8 days')::text,
        'is_easy',true,'learned',true,'stability',8.2956,'difficulty',1,'reps',1,'lapses',0,
        'last_review',now()::text,'scheduled_days',8,'elapsed_days',0,'learning_step',0),
      v_card,
      jsonb_build_object('grade',3,'previous_state','new','next_state','review'),
      null, gen_random_uuid());
    insert into pk_test_results values (24, 'future-dated claim, Easy: the grade succeeds', 'OK', true);
  exception when others then
    insert into pk_test_results values (24, 'future-dated claim, Easy: the grade succeeds', substr(SQLERRM,1,60), false);
  end;

  select * into c from public.cards where id = v_card;
  select count(*) into n from public.review_logs where card_id = v_card;

  insert into pk_test_results values (25, 'future claim, Easy: verified_at is NOT the device timestamp',
    case when c.verified_at < c.prior_known_at then 'server-derived (before the claim)' else 'TOOK THE CLIENT VALUE' end,
    c.verified_at is not null and c.verified_at < c.prior_known_at);
  insert into pk_test_results values (26, 'future claim, Easy: verified_at is server now (within 5s)',
    coalesce(c.verified_at::text,'NULL'),
    c.verified_at is not null and abs(extract(epoch from (c.verified_at - now()))) < 5);
  insert into pk_test_results values (27, 'future claim, Easy: reps = 1', coalesce(c.reps,0)::text, c.reps = 1);
  insert into pk_test_results values (28, 'future claim, Easy: exactly one review_log', n::text, n = 1);
  insert into pk_test_results values (29, 'future claim, Easy: the device''s prior_known_at is preserved verbatim',
    coalesce(c.prior_known_at::text,'LOST'), c.prior_known_at = v_claim and c.prior_source = 'placement');

  -- ── Again ───────────────────────────────────────────────────────────────
  insert into public.cards (user_id, vocab_id, state, learned, is_easy, stability, difficulty,
                            reps, lapses, last_review, due_at, prior_known_at, prior_source, verified_at)
  values (v_user, v_vA, 'new', false, false, null, null, 0, 0, null, v_claim,
          v_claim, 'paste', null)
  returning id into v_card;

  begin
    perform public.grade_card(
      v_vA,
      jsonb_build_object('state','learning','interval_days',0,'due_at',now()::text,
        'is_easy',false,'learned',false,'stability',0.212,'difficulty',6.41,'reps',1,'lapses',0,
        'last_review',now()::text,'scheduled_days',0,'elapsed_days',0,'learning_step',0),
      v_card,
      jsonb_build_object('grade',0,'previous_state','new','next_state','learning'),
      null, gen_random_uuid());
    insert into pk_test_results values (30, 'future-dated claim, Again: the grade succeeds', 'OK', true);
  exception when others then
    insert into pk_test_results values (30, 'future-dated claim, Again: the grade succeeds', substr(SQLERRM,1,60), false);
  end;

  select * into c from public.cards where id = v_card;
  select count(*) into n from public.review_logs where card_id = v_card;

  insert into pk_test_results values (31, 'future claim, Again: verified_at is NOT the device timestamp',
    case when c.verified_at < c.prior_known_at then 'server-derived (before the claim)' else 'TOOK THE CLIENT VALUE' end,
    c.verified_at is not null and c.verified_at < c.prior_known_at);
  insert into pk_test_results values (32, 'future claim, Again: verified_at is server now (within 5s)',
    coalesce(c.verified_at::text,'NULL'),
    c.verified_at is not null and abs(extract(epoch from (c.verified_at - now()))) < 5);
  insert into pk_test_results values (33, 'future claim, Again: reps = 1', coalesce(c.reps,0)::text, c.reps = 1);
  insert into pk_test_results values (34, 'future claim, Again: exactly one review_log', n::text, n = 1);
end $$;

-- ── 8. Why floats are excluded from the CAS predicate ───────────────────────
-- Read-only, against whatever legacy rows still exist. extra_float_digits = 0,
-- so a `real` column's text/JSON rendering does NOT round-trip: PostgREST
-- reports 6.666 while the stored value is 6.66599559783936. Putting difficulty
-- in a CAS WHERE would therefore match nothing and skip every replay as stale.
insert into pk_test_results
select 35,
       'float equality would match ' || count(*) filter (where difficulty = (difficulty::text)::real)
         || ' of ' || count(*) || ' legacy rows (so floats are excluded)',
       coalesce(string_agg(distinct difficulty::text || ' stored as ' || difficulty::float8::text, '; '), 'no legacy rows left'),
       true
  from public.cards
 where stability = 21 and coalesce(reps,0) >= 1;

select n, assertion, result, case when ok then 'PASS' else 'FAIL' end as status
from pk_test_results order by n;

select count(*) filter (where not ok) as failures,
       case when count(*) filter (where not ok) = 0 then 'ALL PASS' else 'FAILURES PRESENT' end as verdict
from pk_test_results;

rollback;
