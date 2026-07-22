-- supabase/migrations/20260722120000_transactional_grading.sql
-- Transactional grading. The flashcard grade path used to issue three separate
-- writes with no transaction around them — the card row update/insert, the
-- review_logs insert, and the daily_activity upsert. A failure between them left
-- partial state: a graded card with no review log, or activity counted for a
-- grade that never persisted. This is the most frequently executed write path in
-- the app, so it gets a single security-definer RPC instead.
--
-- Everything here is ADDITIVE and idempotent:
--   * review_logs gains a nullable client_op_id (dedupe key for offline replay)
--   * a partial unique index on (user_id, client_op_id)
--   * the grade_card() function
-- No existing column, policy or table is altered or dropped, and the client
-- falls back to the old multi-write path when this function is absent.

-- 1) Idempotency key for replayed grades.
-- The offline outbox stamps each queued grade with a client-generated uuid. If
-- an op is replayed (a delete-from-outbox that failed after a successful write,
-- or two tabs flushing at once) the second call is a no-op instead of a second
-- review log and a double-counted study day.
alter table public.review_logs add column if not exists client_op_id uuid;

create unique index if not exists review_logs_user_op_idx
on public.review_logs(user_id, client_op_id)
where client_op_id is not null;

-- 2) The whole grade write, atomically.
--
-- p_updates   the columns produced by src/srs.js `schedule()`. Applied through an
--             explicit whitelist — arbitrary keys (user_id, id, …) are ignored,
--             so a client can never steer this into another user's row.
-- p_card_id   null for a card the learner is meeting for the first time; the
--             insert is an upsert on (user_id, vocab_id) so a replayed "new card"
--             grade can never create a duplicate.
-- p_log       null to skip the review log.
-- p_activity  {date, mode:'set'|'increment', studied, new, learning, review}.
--             'set' writes absolute session totals (the online screen's running
--             tally, matching the previous client behavior); 'increment' adds to
--             the stored row (offline replay, where each op carries its own +1).
-- p_op_id     the dedupe key described above; null disables deduping.
--
-- The caller's user id is NEVER taken from the client — it is auth.uid(), and
-- the update path additionally asserts the card belongs to that user.
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
  -- Did this call create the card row? "Undo" deletes only a row its own grade
  -- created — never one another device had already made.
  v_inserted boolean := false;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- A jsonb argument sent as JSON null can arrive as 'null'::jsonb rather than
  -- SQL NULL, which is NOT null and would make the blocks below run on empty
  -- input. Normalise once so "absent" means absent everywhere.
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
      learning_step  = coalesce((p_updates->>'learning_step')::int, c.learning_step)
    where c.id = p_card_id
      and c.user_id = v_user_id
    returning c.id, c.vocab_id into v_card_id, v_vocab_id;

    -- Not this user's card (or gone). Fail loudly rather than silently no-op.
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
    -- The learner may already have this card (studied online meanwhile, or a
    -- prior partial flush inserted it) — upsert instead of failing.
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
      learning_step  = excluded.learning_step
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
      -- A concurrent flush applied this same op between the check above and
      -- here. The failed statement is rolled back to this block's implicit
      -- savepoint; report the op as already applied.
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
