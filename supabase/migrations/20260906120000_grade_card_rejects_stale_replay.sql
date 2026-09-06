-- supabase/migrations/20260906120000_grade_card_rejects_stale_replay.sql
-- Stop a stale offline grade from overwriting a newer one.
--
-- WHY THIS EXISTS. grade_card applies p_updates as ABSOLUTE values under
-- coalesce(...), with no ordering guard. Every column the client sends wins,
-- whenever it arrives. The client_op_id de-dupe does not help here: it makes a
-- REPLAY of the same op a no-op, and a stale op is not a replay — it has never
-- been applied.
--
-- The sequence, all of it ordinary use:
--
--   Mon  phone, offline: card graded, reps 4 -> 5, due +3d. Op sits in the
--        outbox (src/syncQueue.js enqueueGrade).
--   Tue  web, online: the same card graded, reps 5 -> 6, due +8d. Written.
--   Wed  phone reconnects, flushOutbox replays Monday's op.
--
-- Wednesday's write puts the row back to reps 5 with Monday's stability and
-- due_at. Tuesday's review is erased from the card — reps goes DOWN, and the
-- card is rescheduled from a superseded state. reps is the one fact meaning
-- "a human graded this word inside Hanzi Dojo" (CLAUDE.md §7.3b), and
-- isLearned, isMastered and the level-test gate all rest on it.
--
-- THE GUARD. The card's scheduler columns are left alone when the incoming
-- last_review is strictly older than the row's current last_review. Both the
-- UPDATE branch and the INSERT ... ON CONFLICT branch, because a stale op with
-- cardId null reaches the second one.
--
-- WHAT IS DELIBERATELY STILL WRITTEN. The review log and the daily activity.
-- The grade genuinely happened; it is the SCHEDULING that is superseded, not
-- the history. Dropping the log would lose a real observation and make reps
-- disagree with the log count in the other direction.
--
-- WHAT IS DELIBERATELY NOT GUARDED. A null last_review on either side applies
-- as before: a row that was never graded has nothing to be stale against, and
-- an op carrying no last_review cannot be ordered. Failing open there keeps a
-- legitimate write from being dropped on a technicality; the columns that can
-- go backwards are exactly the ones last_review orders.
--
-- Comparison is on last_review rather than on reps. reps is a count, and two
-- devices can legitimately reach the same count from different observations;
-- last_review is the instant the scheduler used, which is what makes one write
-- older than another.
--
-- Idempotent: create or replace. The function body below is the previous
-- migration's, unchanged except for the guard.
--

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
  -- SERVER time, deliberately. An earlier draft derived this from the client's
  -- p_updates->>'last_review', which meant the client could choose its own
  -- verified_at — contradicting the guarantee this column exists to make.
  --
  -- verified_at answers "when did the SERVER observe this learner genuinely
  -- grade this claim", which is a fact about our own records. It deliberately
  -- does NOT have to equal the scheduler's last_review: that stays exactly as
  -- srs.schedule() produced it, because FSRS intervals are computed from it and
  -- must keep the client's grading semantics unchanged.
  --
  -- It is likewise NOT ordered against prior_known_at, which is stamped by the
  -- device clock. A device running ahead of the server produces
  -- verified_at < prior_known_at on a completely genuine grade, so 20260822160000
  -- deliberately enforces no ordering between the two — see the long note there.
  -- Do not "fix" that by clamping this to greatest(now(), prior_known_at): that
  -- would hand the device the ability to push a server-authoritative timestamp
  -- into the future.
  v_verified_at timestamptz := now();
  -- Stale-replay guard. See the header.
  v_incoming_last_review timestamptz := (p_updates->>'last_review')::timestamptz;
  v_existing_last_review timestamptz;
  v_stale boolean := false;
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
    -- Is this write superseded? Read the row's own last_review first; a stale
    -- op must not touch a single scheduler column.
    select c.last_review into v_existing_last_review
    from public.cards c
    where c.id = p_card_id and c.user_id = v_user_id;

    if not found then
      raise exception 'Card not found';
    end if;

    v_stale := v_incoming_last_review is not null
           and v_existing_last_review is not null
           and v_incoming_last_review < v_existing_last_review;

    if v_stale then
      -- Resolve the ids so the log and activity below still write, then leave
      -- the card exactly as the newer grade left it.
      select c.id, c.vocab_id into v_card_id, v_vocab_id
      from public.cards c
      where c.id = p_card_id and c.user_id = v_user_id;
    else
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
        -- Server-derived (now()), so the client cannot steer it, and it cannot be
        -- set on a card that was never claimed.
        verified_at    = case
                           when c.prior_known_at is not null and c.verified_at is null
                             then v_verified_at
                           else c.verified_at
                         end
      where c.id = p_card_id
        and c.user_id = v_user_id
      returning c.id, c.vocab_id into v_card_id, v_vocab_id;

      if not found then
        raise exception 'Card not found';
    end if;
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
                           then v_verified_at
                         else c.verified_at
                       end
    -- Same guard on the conflict path: an op with no card id still lands here
    -- when the row already exists, which is exactly the offline-replay shape.
    where c.last_review is null
       or excluded.last_review is null
       or excluded.last_review >= c.last_review
    returning c.id, c.vocab_id into v_card_id, v_vocab_id;

    -- A filtered-out conflict updates no row, so RETURNING gives nothing.
    -- The card exists and its ids are still needed for the log below.
    if v_card_id is null then
      select c.id, c.vocab_id into v_card_id, v_vocab_id
      from public.cards c
      where c.user_id = v_user_id and c.vocab_id = p_vocab_id;
    end if;
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
