-- supabase/migrations/20260822170000_grade_card_verifies_claims.sql
-- Teach grade_card to verify a prior-knowledge claim, atomically.
--
-- WHY THIS EXISTS. 20260822160000 added cards_unverified_claim_is_inert, which
-- says an UNVERIFIED claim may carry no scheduler state:
--
--   prior_known_at is not null and verified_at is null
--     → state must be 'new', reps/lapses 0, stability/difficulty/last_review null
--
-- A claim's first calibration grade changes exactly those fields. grade_card's
-- 13-column whitelist does not include verified_at, so the row would land in
-- the forbidden shape — scheduler state present, verified_at still null — and
-- Postgres rejects it. Verified against the live database inside a rolled-back
-- transaction: the whitelist update was REJECTED by the constraint, and the
-- identical update WITH verified_at was accepted. Without this migration every
-- first calibration grade fails.
--
-- The fix is one CASE expression in the same UPDATE, so the card mutation, the
-- verification stamp, the review log and the daily activity remain a single
-- transaction. There is deliberately no second client write: a two-write
-- conversion could leave a claim marked verified with no review behind it, or a
-- graded card still marked unverified, and the whole point of grade_card
-- (see 20260722120000's header) is that this path is atomic.
--
-- WHAT COUNTS AS VERIFICATION. Any real grade, right or wrong:
--   "I knew it"    → Easy  → we observed the learner, and the claim held
--   "Didn't know"  → Again → we observed the learner, and the claim was wrong
-- Verification means we have an observation, not that the learner was correct.
-- A refuted claim is verified knowledge too — it is how we learn the claim was
-- false. So the stamp is unconditional on grade.
--
-- Idempotent in the way that matters: the CASE only fires while verified_at is
-- still null, so a second grade on the same card never moves the timestamp, and
-- a replayed offline grade (deduped upstream on client_op_id) cannot either.
--
-- Everything else in this function is byte-identical to 20260722120000.

create or replace function public.grade_card(
  p_vocab_id uuid default null,
  p_updates jsonb default '{}'::jsonb,
  p_card_id uuid default null,
  p_log jsonb default null,
  p_activity jsonb default null,
  p_op_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_card_id uuid;
  v_vocab_id uuid;
  v_log_id uuid;
  v_mode text;
  v_day date;
  v_inserted boolean := false;
  -- The moment the learner actually answered. srs.schedule() sets last_review
  -- to the grade time, so a claim is stamped verified at the review that
  -- verified it — never at some later write time.
  v_reviewed_at timestamptz := coalesce((p_updates->>'last_review')::timestamptz, now());
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_updates is null or jsonb_typeof(p_updates) <> 'object' then
    p_updates := '{}'::jsonb;
  end if;
  if p_log is not null and jsonb_typeof(p_log) <> 'object' then
    p_log := null;
  end if;
  if p_activity is not null and jsonb_typeof(p_activity) <> 'object' then
    p_activity := null;
  end if;

  -- Already applied? Return the original ids and touch nothing.
  if p_op_id is not null then
    select id, card_id into v_log_id, v_card_id
    from public.review_logs
    where user_id = v_user_id and client_op_id = p_op_id
    limit 1;
    if found then
      return jsonb_build_object(
        'card_id', v_card_id, 'log_id', v_log_id, 'already_applied', true);
    end if;
  end if;

  -- ── Card ─────────────────────────────────────────────────────────────────
  if p_card_id is not null then
    update public.cards c set
      state          = coalesce(p_updates->>'state', c.state),
      interval_days  = coalesce((p_updates->>'interval_days')::int, c.interval_days),
      due_at         = coalesce((p_updates->>'due_at')::timestamptz, c.due_at),
      is_easy        = coalesce((p_updates->>'is_easy')::boolean, c.is_easy),
      learned        = coalesce((p_updates->>'learned')::boolean, c.learned),
      stability      = coalesce((p_updates->>'stability')::real, c.stability),
      difficulty     = coalesce((p_updates->>'difficulty')::real, c.difficulty),
      reps           = coalesce((p_updates->>'reps')::int, c.reps),
      lapses         = coalesce((p_updates->>'lapses')::int, c.lapses),
      last_review    = coalesce((p_updates->>'last_review')::timestamptz, c.last_review),
      scheduled_days = coalesce((p_updates->>'scheduled_days')::int, c.scheduled_days),
      elapsed_days   = coalesce((p_updates->>'elapsed_days')::int, c.elapsed_days),
      learning_step  = coalesce((p_updates->>'learning_step')::int, c.learning_step),
      -- The claim is verified by this very grade, in this very statement.
      -- Server-derived: the client cannot steer it, and it cannot be set on a
      -- card that was never claimed.
      verified_at    = case
                         when c.prior_known_at is not null and c.verified_at is null
                           then v_reviewed_at
                         else c.verified_at
                       end
    where c.id = p_card_id
      and c.user_id = v_user_id
    returning c.id, c.vocab_id into v_card_id, v_vocab_id;

    if not found then
      raise exception 'Card not found';
    end if;
  else
    if p_vocab_id is null then
      raise exception 'vocab_id required for a new card';
    end if;
    select not exists (
      select 1 from public.cards
      where user_id = v_user_id and vocab_id = p_vocab_id
    ) into v_inserted;
    insert into public.cards as c (
      user_id, vocab_id, state, interval_days, due_at, is_easy, learned,
      stability, difficulty, reps, lapses, last_review,
      scheduled_days, elapsed_days, learning_step
    )
    values (
      v_user_id,
      p_vocab_id,
      coalesce(p_updates->>'state', 'new'),
      coalesce((p_updates->>'interval_days')::int, 0),
      coalesce((p_updates->>'due_at')::timestamptz, now()),
      coalesce((p_updates->>'is_easy')::boolean, false),
      coalesce((p_updates->>'learned')::boolean, false),
      coalesce((p_updates->>'stability')::real, 0),
      coalesce((p_updates->>'difficulty')::real, 0),
      coalesce((p_updates->>'reps')::int, 0),
      coalesce((p_updates->>'lapses')::int, 0),
      (p_updates->>'last_review')::timestamptz,
      coalesce((p_updates->>'scheduled_days')::int, 0),
      coalesce((p_updates->>'elapsed_days')::int, 0),
      coalesce((p_updates->>'learning_step')::int, 0)
    )
    -- The learner may already have this card — including as an inert claim,
    -- which is exactly the offline-replay path for a calibration check.
    on conflict (user_id, vocab_id) do update set
      state          = excluded.state,
      interval_days  = excluded.interval_days,
      due_at         = excluded.due_at,
      is_easy        = excluded.is_easy,
      learned        = excluded.learned,
      stability      = excluded.stability,
      difficulty     = excluded.difficulty,
      reps           = excluded.reps,
      lapses         = excluded.lapses,
      last_review    = excluded.last_review,
      scheduled_days = excluded.scheduled_days,
      elapsed_days   = excluded.elapsed_days,
      learning_step  = excluded.learning_step,
      -- `c` is the EXISTING row here, so this reads the claim it is replacing.
      verified_at    = case
                         when c.prior_known_at is not null and c.verified_at is null
                           then v_reviewed_at
                         else c.verified_at
                       end
    returning c.id, c.vocab_id into v_card_id, v_vocab_id;
  end if;

  -- ── Review log ───────────────────────────────────────────────────────────
  if p_log is not null then
    begin
      insert into public.review_logs (
        user_id, card_id, vocab_id, grade,
        previous_state, next_state,
        previous_interval_days, next_interval_days,
        client_op_id
      )
      values (
        v_user_id,
        v_card_id,
        coalesce(p_vocab_id, v_vocab_id),
        coalesce((p_log->>'grade')::int, 0),
        p_log->>'previous_state',
        p_log->>'next_state',
        (p_log->>'previous_interval_days')::int,
        (p_log->>'next_interval_days')::int,
        p_op_id
      )
      returning id into v_log_id;
    exception when unique_violation then
      if p_op_id is null then
        raise;
      end if;
      select id, card_id into v_log_id, v_card_id
      from public.review_logs
      where user_id = v_user_id and client_op_id = p_op_id
      limit 1;
      return jsonb_build_object(
        'card_id', v_card_id, 'log_id', v_log_id, 'already_applied', true);
    end;
  end if;

  -- ── Daily activity ───────────────────────────────────────────────────────
  if p_activity is not null then
    v_mode := coalesce(p_activity->>'mode', 'set');
    v_day := coalesce((p_activity->>'date')::date, current_date);
    insert into public.daily_activity as da (
      user_id, activity_date, studied_cards, new_cards, learning_cards, review_cards
    )
    values (
      v_user_id,
      v_day,
      coalesce((p_activity->>'studied')::int, 0),
      coalesce((p_activity->>'new')::int, 0),
      coalesce((p_activity->>'learning')::int, 0),
      coalesce((p_activity->>'review')::int, 0)
    )
    on conflict (user_id, activity_date) do update set
      studied_cards  = case when v_mode = 'increment'
                            then da.studied_cards + excluded.studied_cards
                            else excluded.studied_cards end,
      new_cards      = case when v_mode = 'increment'
                            then da.new_cards + excluded.new_cards
                            else excluded.new_cards end,
      learning_cards = case when v_mode = 'increment'
                            then da.learning_cards + excluded.learning_cards
                            else excluded.learning_cards end,
      review_cards   = case when v_mode = 'increment'
                            then da.review_cards + excluded.review_cards
                            else excluded.review_cards end;
  end if;

  return jsonb_build_object(
    'card_id', v_card_id, 'log_id', v_log_id,
    'already_applied', false, 'inserted', v_inserted);
end;
$$;

revoke all on function public.grade_card(uuid, jsonb, uuid, jsonb, jsonb, uuid) from public;
grant execute on function public.grade_card(uuid, jsonb, uuid, jsonb, jsonb, uuid) to authenticated;

notify pgrst, 'reload schema';
