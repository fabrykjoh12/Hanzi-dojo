-- supabase/migrations/20260906120000_grade_card_rejects_stale_replay.sql
-- Stop a stale offline grade from overwriting a newer one.
--
-- WHY THIS EXISTS. grade_card applies p_updates as ABSOLUTE values under
-- coalesce(...), with no ordering guard. Every column the client sends wins,
-- whenever it arrives. The client_op_id de-dupe does not help: it makes a
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
-- THE ORDERING KEY IS reps, NOT last_review, AND THAT IS THE WHOLE POINT.
--
-- An earlier draft of this migration compared last_review. That was wrong, and
-- wrong in a way this repository has already ruled on: last_review is stamped
-- by the DEVICE clock (src/srs.js), and 20260822160000 says in as many words,
-- "Two timestamps from two clock domains should not be ordered by the
-- database." Ordering two device clocks is worse still. It fails BOTH ways:
--
--   phone clock 10 min SLOW  — the web grades at 12:00; two minutes later the
--     learner grades the same card on the phone, which stamps 11:52. The guard
--     reads that as stale and DISCARDS a genuinely newer grade, while still
--     writing its review_logs row — so the log count now exceeds reps, the same
--     disagreement this guard exists to prevent, in the opposite direction.
--   phone clock 2h FAST — Monday's stale op carries 14:00, Tuesday's real write
--     carries 13:00, so the stale op wins anyway and the bug survives.
--
-- reps has neither problem, because it is not a clock. srs.schedule() derives
-- the new value by incrementing the row the client READ, so a genuinely newer
-- grade always carries exactly existing + 1, and a superseded one carries a
-- value the row has already passed. `incoming > existing` is therefore the
-- precise stale signature, and it is clock-free.
--
-- Two devices that both grade offline from reps 4 both produce 5. The first
-- applies (5 > 4); the second is refused (5 > 5 is false). That is correct: the
-- second was computed from a state the card has left.
--
-- THE GUARD IS PART OF THE WRITE, not a check before it. An earlier draft did
-- SELECT ... then UPDATE, which is two statements: under READ COMMITTED a newer
-- grade committing between them would be read as "not stale" and then
-- overwritten. The predicate now lives in the UPDATE's own WHERE and in the
-- ON CONFLICT ... DO UPDATE ... WHERE, so the decision and the write are one
-- statement on one row version. Both paths, because a stale op with cardId null
-- reaches the second one.
--
-- WHAT A REFUSED GRADE DOES NOT WRITE. Not the review log, not the day count.
--
-- An earlier draft wrote both, on the reasoning that "the grade genuinely
-- happened; it is the SCHEDULING that is superseded". That reasoning is the one
-- this very header uses to DISQUALIFY the last_review draft above — a guard
-- that discards a write while still logging it makes the log count exceed reps,
-- which is the disagreement this guard exists to prevent. The mechanism does
-- not change when the ordering key is reps. Worse, `count(review_logs) > reps`
-- is the query docs/BACKLOG.md uses to COUNT the victims of the original bug,
-- so a logging guard would go on manufacturing its own damage signature and
-- nothing in the data could tell the fix from the bug.
--
-- WHAT IS DELIBERATELY NOT GUARDED. A null on either side applies as before: a
-- row with no reps has nothing to be stale against, and an op carrying none
-- cannot be ordered. Failing open there keeps a legitimate write from being
-- dropped on a technicality.
--
-- WHAT THIS DOES NOT COVER, so the backlog entry does not over-claim: four
-- client paths write cards scheduler columns WITHOUT going through grade_card —
-- src/Study.jsx's undo, src/Study.jsx's resetCard, src/Test.jsx and
-- src/CreativeMode.jsx. Undo in particular writes the client's pre-grade
-- snapshot straight over whatever the server holds. Pre-existing, out of scope
-- here, and recorded in docs/BACKLOG.md.
--
-- resetCard is the one that interacts with THIS guard rather than merely
-- sitting beside it: it writes reps 0, so after a reset an outbox op carrying
-- reps 5 satisfies `5 > 0` and is ADMITTED as newer, resurrecting the
-- pre-reset scheduler state with the guard's blessing. The reset's own outbox
-- drop (PR #241) is what actually closes that, by deleting those ops when the
-- reset happens; the guard cannot, because reps is not monotonic across a
-- reset and nothing in the row records that one occurred.
--
-- The result now carries `stale`, so a client can tell a rejected write from an
-- applied one instead of both looking like success.
--
-- Idempotent: create or replace. The body below is the previous migration's,
-- unchanged except for the guard.
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
  -- Stale-replay guard. See the header. Read in the BODY rather than here: a
  -- DECLARE default is evaluated before the auth check and before the
  -- already-applied early return, so a malformed value would raise a cast error
  -- on a path that previously returned cleanly.
  v_incoming_reps int;
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

  v_incoming_reps := (p_updates->>'reps')::int;

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
      -- Server-derived (now()), so the client cannot steer it, and it cannot be
      -- set on a card that was never claimed.
      verified_at    = case
                         when c.prior_known_at is not null and c.verified_at is null
                           then v_verified_at
                         else c.verified_at
                       end
    where c.id = p_card_id
      and c.user_id = v_user_id
      -- The guard, inside the write. See the header: one statement, one row
      -- version, so a grade committing concurrently cannot slip between a
      -- check and an update.
      and (v_incoming_reps is null or c.reps is null or v_incoming_reps > c.reps)
    returning c.id, c.vocab_id into v_card_id, v_vocab_id;

    if not found then
      -- Either the card is gone, or this write is superseded. Tell them apart:
      -- a missing card is still an error, a superseded one is not.
      select c.id, c.vocab_id into v_card_id, v_vocab_id
      from public.cards c
      where c.id = p_card_id and c.user_id = v_user_id;

      if not found then
        raise exception 'Card not found';
      end if;
      v_stale := true;
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
    -- Same guard, same reason, on the path a stale op with no card id takes.
    --
    -- v_incoming_reps, NOT excluded.reps. The insert's values list coalesces
    -- reps to 0, so excluded.reps can never be null and the fail-open limb
    -- would be dead here — a call whose p_updates carries no reps, against an
    -- existing row with reps > 0, would have been rejected in full: state,
    -- due_at, stability, learned, verified_at, all of it. The UPDATE path above
    -- reads the raw incoming value and fails open; these two must not disagree
    -- about the same input.
    where v_incoming_reps is null or c.reps is null or v_incoming_reps > c.reps
    returning c.id, c.vocab_id into v_card_id, v_vocab_id;

    -- A filtered-out conflict updates no row, so RETURNING gives nothing. The
    -- card exists and its ids are still needed for the log below.
    if v_card_id is null then
      select c.id, c.vocab_id into v_card_id, v_vocab_id
      from public.cards c
      where c.user_id = v_user_id and c.vocab_id = p_vocab_id;
      v_stale := true;
    end if;
  end if;

  -- ── Review log ───────────────────────────────────────────────────────────
  --
  -- `not v_stale` is load-bearing, and it is the header's own argument applied
  -- to itself. That header disqualifies the last_review draft partly because it
  -- "DISCARDS a genuinely newer grade, while still writing its review_logs row
  -- — so the log count now exceeds reps, the same disagreement this guard
  -- exists to prevent". The mechanism is identical when the ordering key is
  -- reps: a refused write that still logged would keep manufacturing the exact
  -- damage signature docs/BACKLOG.md uses to COUNT the victims of the original
  -- bug, so the fix and the bug would be indistinguishable in the data.
  --
  -- The same goes for daily_activity below: a refused grade did not happen, so
  -- it does not belong in the day's count.
  if p_log is not null and not v_stale then
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
  if p_activity is not null and not v_stale then
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
    'already_applied', false, 'inserted', v_inserted,
    -- So a rejected scheduler write is distinguishable from an applied one.
    -- Without it src/syncQueue.js reports ok and the client keeps its
    -- superseded local card with no signal to refresh.
    'stale', v_stale);
end;
$$;

revoke all on function public.grade_card(uuid, jsonb, uuid, jsonb, jsonb, uuid) from public;
grant execute on function public.grade_card(uuid, jsonb, uuid, jsonb, jsonb, uuid) to authenticated;

notify pgrst, 'reload schema';
