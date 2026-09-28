-- Durable transactional review receipts. Apply after the prior-knowledge
-- migrations (20260822160000, 170000, 180000) and story rewards
-- (20260809090000). No learner data is rewritten.
alter table public.cards add column if not exists first_reviewed_at timestamptz;
alter table public.cards add column if not exists revision bigint not null default 0;
alter table public.profiles add column if not exists review_generation bigint not null default 0;

create or replace function public.guard_review_generation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and
     ((tg_op = 'INSERT' and new.review_generation <> 0) or
      (tg_op = 'UPDATE' and new.review_generation is distinct from old.review_generation)) then
    raise exception 'review_generation is server managed' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_guard_review_generation on public.profiles;
create trigger profiles_guard_review_generation before insert or update on public.profiles
for each row execute function public.guard_review_generation();

-- Direct legacy writes also advance revision, invalidating stale v2 snapshots.
create or replace function public.advance_card_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and
     ((tg_op = 'INSERT' and (new.revision <> 0 or new.first_reviewed_at is not null)) or
      (tg_op = 'UPDATE' and (new.revision is distinct from old.revision
        or new.first_reviewed_at is distinct from old.first_reviewed_at))) then
    raise exception 'revision is server managed' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then new.revision := old.revision + 1; end if;
  return new;
end;
$$;
drop trigger if exists cards_advance_revision on public.cards;
create trigger cards_advance_revision before insert or update on public.cards
for each row execute function public.advance_card_revision();

create table if not exists public.grade_operations (
  user_id uuid not null references public.profiles(id) on delete cascade,
  op_id uuid not null,
  -- No card/log foreign key: reset and Undo cannot erase receipts.
  vocab_id uuid not null,
  card_id uuid not null,
  log_id uuid not null,
  generation bigint not null,
  request jsonb not null,
  legacy_request jsonb,
  before_card jsonb,
  after_card jsonb not null,
  activity_date date not null,
  activity_delta jsonb not null,
  status text not null default 'applied' check (status in ('applied', 'undone')),
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  primary key (user_id, op_id)
);
alter table public.grade_operations enable row level security;
drop policy if exists grade_operations_owner_read on public.grade_operations;
create policy grade_operations_owner_read on public.grade_operations
for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.grade_operations from public, anon, authenticated;
grant select on public.grade_operations to authenticated;
create index if not exists grade_operations_card_idx on public.grade_operations(user_id, card_id);

-- Cast through the real row type so equivalent timestamp/float spellings compare
-- semantically. Ignore joined vocab and display-only metadata, never scheduler,
-- claim, revision, or identity fields.
create or replace function public.review_card_snapshot(p_card jsonb)
returns jsonb language sql stable set search_path = '' as $$
  select case when p_card is null or p_card = 'null'::jsonb then null else (
    select jsonb_object_agg(key, value)
    from jsonb_each(to_jsonb(jsonb_populate_record(null::public.cards, p_card)))
    where key = any(array[
      'id', 'user_id', 'vocab_id', 'revision', 'state', 'learning_step',
      'interval_days', 'due_at', 'is_easy', 'learned', 'stability', 'difficulty',
      'reps', 'lapses', 'last_review', 'scheduled_days', 'elapsed_days',
      'prior_known_at', 'prior_source', 'verified_at', 'first_reviewed_at'
    ])
  ) end;
$$;
create or replace function public.review_learner_lock(p_user_id uuid)
returns void language sql volatile set search_path = '' as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('hanzi-review:' || p_user_id::text, 0));
$$;

create or replace function public.grade_card_v2(
  p_vocab_id uuid, p_card_id uuid, p_updates jsonb, p_log jsonb, p_day date,
  p_op_id uuid, p_expected jsonb, p_user_id uuid, p_generation bigint
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_generation bigint;
  v_before public.cards%rowtype;
  v_after public.cards%rowtype;
  v_op public.grade_operations%rowtype;
  v_request jsonb;
  v_before_json jsonb;
  v_log_id uuid;
  v_new int := 0;
  v_learning int := 0;
  v_review int := 0;
  v_found boolean;
begin
  if v_owner is null or p_user_id is distinct from v_owner then
    raise exception 'Not authenticated as review owner' using errcode = '42501';
  end if;
  if p_op_id is null or p_vocab_id is null or p_day is null or p_generation is null
     or p_updates is null or jsonb_typeof(p_updates) <> 'object'
     or p_log is null or jsonb_typeof(p_log) <> 'object'
     or p_generation < 0 or not isfinite(p_day)
     or not (p_updates ?& array['state','interval_days','due_at','is_easy','learned',
       'stability','difficulty','reps','lapses','last_review','scheduled_days','elapsed_days','learning_step']) then
    raise exception 'Complete review intent required' using errcode = '22023';
  end if;
  perform public.review_learner_lock(v_owner);
  v_request := jsonb_build_object('vocab_id', p_vocab_id, 'card_id', p_card_id,
    'updates', p_updates, 'log', p_log, 'day', p_day,
    'expected', public.review_card_snapshot(p_expected), 'generation', p_generation);
  select * into v_op from public.grade_operations
    where user_id = v_owner and op_id = p_op_id for update;
  if found then
    if v_op.request is distinct from v_request then
      raise exception 'REVIEW_CONFLICT: operation payload changed' using errcode = '40001';
    end if;
    select * into v_after from public.cards where id = v_op.card_id and user_id = v_owner;
    return jsonb_build_object('status', v_op.status, 'card_id', v_op.card_id,
      'log_id', v_op.log_id, 'card', case when found then to_jsonb(v_after) else null end,
      'already_applied', true, 'inserted', v_op.before_card is null);
  end if;
  if exists (select 1 from public.review_logs where user_id = v_owner and client_op_id = p_op_id) then
    raise exception 'REVIEW_CONFLICT: operation belongs to a legacy receipt' using errcode = '40001';
  end if;
  select review_generation into v_generation from public.profiles where id = v_owner for update;
  if not found or p_generation <> v_generation then
    raise exception 'REVIEW_CONFLICT: progress reset; reload before reviewing' using errcode = '40001';
  end if;
  select * into v_before from public.cards
    where user_id = v_owner and vocab_id = p_vocab_id for update;
  v_found := found;
  v_before_json := case when v_found then to_jsonb(v_before) else null end;
  if (v_found and (p_card_id is distinct from v_before.id or
       public.review_card_snapshot(p_expected) is distinct from public.review_card_snapshot(v_before_json)))
     or (not v_found and (p_card_id is not null or public.review_card_snapshot(p_expected) is not null)) then
    raise exception 'REVIEW_CONFLICT: card changed; reload before reviewing' using errcode = '40001';
  end if;
  -- Keep FSRS scheduling in the real application producer. Enforce one genuine
  -- observation and consistent logging against the exact state it read.
  if (p_log->>'grade')::int not between 0 and 3 or p_log->>'grade' is null
     or p_updates->>'state' not in ('learning', 'review', 'relearning')
     or p_updates->>'state' is null
     or (p_updates->>'reps')::int is distinct from coalesce(v_before.reps, 0) + 1
     or p_updates->>'due_at' is null or p_updates->>'last_review' is null
     or p_log->>'previous_state' is distinct from coalesce(v_before.state, 'new')
     or p_log->>'next_state' is distinct from p_updates->>'state'
     or (p_log->>'previous_interval_days')::int is distinct from coalesce(v_before.interval_days, 0)
     or (p_log->>'next_interval_days')::int is distinct from (p_updates->>'interval_days')::int then
    raise exception 'Invalid scheduler observation' using errcode = '22023';
  end if;
  if v_found then
    update public.cards set
      state = p_updates->>'state', interval_days = (p_updates->>'interval_days')::int,
      due_at = (p_updates->>'due_at')::timestamptz, is_easy = (p_updates->>'is_easy')::boolean,
      learned = (p_updates->>'learned')::boolean, stability = (p_updates->>'stability')::real,
      difficulty = (p_updates->>'difficulty')::real, reps = (p_updates->>'reps')::int,
      lapses = (p_updates->>'lapses')::int, last_review = (p_updates->>'last_review')::timestamptz,
      scheduled_days = (p_updates->>'scheduled_days')::int,
      elapsed_days = (p_updates->>'elapsed_days')::int, learning_step = (p_updates->>'learning_step')::int,
      first_reviewed_at = case when coalesce(reps, 0) = 0 and first_reviewed_at is null
        then (p_updates->>'last_review')::timestamptz else first_reviewed_at end,
      verified_at = case when prior_known_at is not null and verified_at is null then now() else verified_at end
    where id = v_before.id and user_id = v_owner returning * into v_after;
  else
    insert into public.cards (user_id, vocab_id, revision, state, interval_days,
      due_at, is_easy, learned, stability, difficulty, reps, lapses, last_review,
      scheduled_days, elapsed_days, learning_step, first_reviewed_at)
    values (v_owner, p_vocab_id, 1, p_updates->>'state', (p_updates->>'interval_days')::int,
      (p_updates->>'due_at')::timestamptz, (p_updates->>'is_easy')::boolean,
      (p_updates->>'learned')::boolean, (p_updates->>'stability')::real,
      (p_updates->>'difficulty')::real, (p_updates->>'reps')::int,
      (p_updates->>'lapses')::int, (p_updates->>'last_review')::timestamptz,
      (p_updates->>'scheduled_days')::int, (p_updates->>'elapsed_days')::int,
      (p_updates->>'learning_step')::int, (p_updates->>'last_review')::timestamptz) returning * into v_after;
  end if;
  insert into public.review_logs(user_id, card_id, vocab_id, grade, previous_state,
    next_state, previous_interval_days, next_interval_days, client_op_id)
  values (v_owner, v_after.id, p_vocab_id, (p_log->>'grade')::int,
    coalesce(v_before.state, 'new'), v_after.state, coalesce(v_before.interval_days, 0),
    v_after.interval_days, p_op_id) returning id into v_log_id;
  if coalesce(v_before.state, 'new') = 'new' and v_before.prior_known_at is null then v_new := 1;
  elsif v_before.state in ('learning', 'relearning') then v_learning := 1;
  elsif v_before.state = 'review' then v_review := 1; end if;
  insert into public.daily_activity as a(user_id, activity_date, studied_cards, new_cards, learning_cards, review_cards)
    values(v_owner, p_day, 1, v_new, v_learning, v_review)
  on conflict (user_id, activity_date) do update set
    studied_cards = a.studied_cards + 1, new_cards = a.new_cards + v_new,
    learning_cards = a.learning_cards + v_learning, review_cards = a.review_cards + v_review;
  insert into public.grade_operations(user_id, op_id, vocab_id, card_id, log_id,
    generation, request, before_card, after_card, activity_date, activity_delta)
  values (v_owner, p_op_id, p_vocab_id, v_after.id, v_log_id, v_generation, v_request,
    v_before_json, to_jsonb(v_after), p_day,
    jsonb_build_object('studied', 1, 'new', v_new, 'learning', v_learning, 'review', v_review));
  return jsonb_build_object('status', 'applied', 'card_id', v_after.id, 'log_id', v_log_id,
    'card', to_jsonb(v_after), 'already_applied', false, 'inserted', not v_found);
end;
$$;

create or replace function public.undo_grade_v2(p_op_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_op public.grade_operations%rowtype;
  v_card public.cards%rowtype;
  v_before public.cards%rowtype;
  v_activity public.daily_activity%rowtype;
  v_log public.review_logs%rowtype;
begin
  if v_owner is null or p_user_id is distinct from v_owner then
    raise exception 'Not authenticated as review owner' using errcode = '42501';
  end if;
  perform public.review_learner_lock(v_owner);
  select * into v_op from public.grade_operations where user_id = v_owner and op_id = p_op_id for update;
  if not found then raise exception 'REVIEW_CONFLICT: unknown operation' using errcode = '40001'; end if;
  select * into v_card from public.cards where id = v_op.card_id and user_id = v_owner for update;
  if v_op.status = 'undone' then
    return jsonb_build_object('status', 'undone', 'card_id', v_op.card_id, 'log_id', v_op.log_id,
      'card', case when found then to_jsonb(v_card) else null end, 'already_applied', true);
  end if;
  if not found or public.review_card_snapshot(to_jsonb(v_card)) is distinct from public.review_card_snapshot(v_op.after_card) then
    raise exception 'REVIEW_CONFLICT: card changed after this grade' using errcode = '40001';
  end if;
  select * into v_log from public.review_logs where id = v_op.log_id and user_id = v_owner for update;
  if not found or v_log.card_id is distinct from v_op.card_id or v_log.vocab_id is distinct from v_op.vocab_id
     or v_log.client_op_id is distinct from v_op.op_id
     or v_log.grade is distinct from (v_op.request->'log'->>'grade')::int
     or v_log.previous_state is distinct from (v_op.request->'log'->>'previous_state')
     or v_log.next_state is distinct from (v_op.request->'log'->>'next_state')
     or v_log.previous_interval_days is distinct from (v_op.request->'log'->>'previous_interval_days')::int
     or v_log.next_interval_days is distinct from (v_op.request->'log'->>'next_interval_days')::int then
    raise exception 'REVIEW_CONFLICT: review log changed' using errcode = '40001';
  end if;
  select * into v_activity from public.daily_activity
    where user_id = v_owner and activity_date = v_op.activity_date for update;
  if not found or v_activity.studied_cards < (v_op.activity_delta->>'studied')::int
     or v_activity.new_cards < (v_op.activity_delta->>'new')::int
     or v_activity.learning_cards < (v_op.activity_delta->>'learning')::int
     or v_activity.review_cards < (v_op.activity_delta->>'review')::int then
    raise exception 'REVIEW_CONFLICT: activity totals changed' using errcode = '40001';
  end if;
  if v_op.before_card is null then
    -- First-observation Undo keeps an inert row; only explicit reset deletes cards.
    update public.cards set state = 'new', interval_days = 0, due_at = created_at,
      is_easy = false, learned = false, stability = null, difficulty = null,
      reps = 0, lapses = 0, last_review = null, scheduled_days = 0, elapsed_days = 0,
      learning_step = 0, verified_at = null, first_reviewed_at = null
      where id = v_card.id and user_id = v_owner returning * into v_card;
  else
    v_before := jsonb_populate_record(null::public.cards, v_op.before_card);
    update public.cards set state = v_before.state, interval_days = v_before.interval_days,
      due_at = v_before.due_at, is_easy = v_before.is_easy, learned = v_before.learned,
      stability = v_before.stability, difficulty = v_before.difficulty, reps = v_before.reps,
      lapses = v_before.lapses, last_review = v_before.last_review,
      scheduled_days = v_before.scheduled_days, elapsed_days = v_before.elapsed_days,
      learning_step = v_before.learning_step, prior_known_at = v_before.prior_known_at,
      prior_source = v_before.prior_source, verified_at = v_before.verified_at,
      first_reviewed_at = v_before.first_reviewed_at
      where id = v_card.id and user_id = v_owner returning * into v_card;
  end if;
  delete from public.review_logs where id = v_op.log_id and user_id = v_owner;
  update public.daily_activity set
    studied_cards = studied_cards - (v_op.activity_delta->>'studied')::int,
    new_cards = new_cards - (v_op.activity_delta->>'new')::int,
    learning_cards = learning_cards - (v_op.activity_delta->>'learning')::int,
    review_cards = review_cards - (v_op.activity_delta->>'review')::int
    where user_id = v_owner and activity_date = v_op.activity_date;
  update public.grade_operations set status = 'undone', undone_at = now()
    where user_id = v_owner and op_id = p_op_id;
  return jsonb_build_object('status', 'undone', 'card_id', v_op.card_id, 'log_id', v_op.log_id,
    'card', to_jsonb(v_card), 'already_applied', false);
end;
$$;

-- Retain the deployed v1 signature. Absolute session totals are unsafe under
-- concurrent sessions; derive additive counters from the actual card instead.
-- A pre-v2 client cannot prove its generation for an absent card after reset,
-- so that ambiguous request fails closed and requires the client to refresh.
create or replace function public.grade_card(
  p_vocab_id uuid default null,
  p_updates jsonb default '{}'::jsonb,
  p_card_id uuid default null,
  p_log jsonb default null,
  p_activity jsonb default null,
  p_op_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_card public.cards%rowtype;
  v_op public.grade_operations%rowtype;
  v_old_log public.review_logs%rowtype;
  v_generation bigint;
  v_request jsonb;
  v_id uuid := coalesce(p_op_id, gen_random_uuid());
  v_vocab uuid := p_vocab_id;
  v_result jsonb;
  v_expected jsonb;
begin
  if v_owner is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  perform public.review_learner_lock(v_owner);
  v_request := jsonb_build_object('vocab_id', p_vocab_id, 'updates', p_updates,
    'card_id', p_card_id, 'log', p_log, 'activity', p_activity);
  if p_op_id is not null then
    select * into v_op from public.grade_operations where user_id = v_owner and op_id = p_op_id for update;
    if found then
      if v_op.legacy_request is distinct from v_request then
        raise exception 'REVIEW_CONFLICT: operation payload or protocol changed' using errcode = '40001';
      end if;
      select * into v_card from public.cards where id = v_op.card_id and user_id = v_owner;
      return jsonb_build_object('status', v_op.status, 'card_id', v_op.card_id,
        'log_id', v_op.log_id, 'card', case when found then to_jsonb(v_card) else null end,
        'already_applied', true, 'inserted', v_op.before_card is null);
    end if;
    -- Existing pre-migration receipts remain valid, but can never write again.
    select * into v_old_log from public.review_logs
      where user_id = v_owner and client_op_id = p_op_id;
    if found then
      if (p_vocab_id is not null and v_old_log.vocab_id is distinct from p_vocab_id)
         or (p_card_id is not null and v_old_log.card_id is distinct from p_card_id)
         or v_old_log.grade is distinct from (p_log->>'grade')::int then
        raise exception 'REVIEW_CONFLICT: legacy operation identity changed' using errcode = '40001';
      end if;
      select * into v_card from public.cards where id = v_old_log.card_id and user_id = v_owner;
      return jsonb_build_object('status', 'applied', 'card_id', v_old_log.card_id,
        'log_id', v_old_log.id, 'card', case when found then to_jsonb(v_card) else null end,
        'already_applied', true);
    end if;
  end if;
  select review_generation into v_generation from public.profiles where id = v_owner for update;
  if p_card_id is not null then
    select * into v_card from public.cards where id = p_card_id and user_id = v_owner for update;
    if not found or (p_vocab_id is not null and p_vocab_id is distinct from v_card.vocab_id) then
      raise exception 'REVIEW_CONFLICT: card absent or changed' using errcode = '40001';
    end if;
    v_vocab := v_card.vocab_id;
    v_expected := to_jsonb(v_card);
  else
    if v_generation <> 0 then
      raise exception 'REVIEW_CONFLICT: refresh required after progress reset' using errcode = '40001';
    end if;
    select * into v_card from public.cards where user_id = v_owner and vocab_id = p_vocab_id for update;
    if found then v_expected := to_jsonb(v_card); end if;
  end if;
  v_result := public.grade_card_v2(v_vocab, v_card.id, p_updates, p_log,
    coalesce((p_activity->>'date')::date, current_date), v_id,
    v_expected, v_owner, v_generation);
  update public.grade_operations set legacy_request = v_request where user_id = v_owner and op_id = v_id;
  return v_result;
end;
$$;

-- Both deployed reset entry points share the same lock and generation change.
-- Receipts deliberately survive; duplicate grades return the current card (or
-- null), never the historical after-image. Unknown old operations cannot revive
-- a card after reset, including an absent first observation queued offline.
create or replace function public.reset_language_progress(
  p_language text, p_system text, p_reset_account_history boolean default false
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  perform public.review_learner_lock(v_owner);
  if not exists (select 1 from public.language_tracks
    where user_id = v_owner and language = p_language and system = p_system) then
    raise exception 'Language track not found';
  end if;
  update public.profiles set review_generation = review_generation + 1 where id = v_owner;
  delete from public.review_logs rl using public.vocabulary v
    where rl.user_id = v_owner and rl.vocab_id = v.id and v.language = p_language and v.system = p_system;
  delete from public.cards c using public.vocabulary v
    where c.user_id = v_owner and c.vocab_id = v.id and v.language = p_language and v.system = p_system;
  if to_regclass('public.writing_stats') is not null then
    delete from public.writing_stats ws using public.vocabulary v
      where ws.user_id = v_owner and ws.vocab_id = v.id and v.language = p_language and v.system = p_system;
  end if;
  delete from public.story_reads sr using public.stories s
    where sr.user_id = v_owner and sr.story_id = s.id and s.language = p_language and s.system = p_system;
  delete from public.story_unlocks su using public.stories s
    where su.user_id = v_owner and su.story_id = s.id and s.language = p_language and s.system = p_system;
  delete from public.story_reward_claims
    where user_id = v_owner and language = p_language and system = p_system;
  delete from public.test_attempts where user_id = v_owner and language = p_language and system = p_system;
  delete from public.level_unlocks where user_id = v_owner and language = p_language and system = p_system;
  update public.language_tracks set current_level = 1, active_series = null
    where user_id = v_owner and language = p_language and system = p_system;
  if p_reset_account_history then
    delete from public.daily_activity where user_id = v_owner;
    update public.profiles set streak = 0, streak_freezes = 1, last_studied_on = null where id = v_owner;
  end if;
end;
$$;
create or replace function public.reset_current_language_progress(
  p_language text, p_system text, p_reset_streak boolean default true
)
returns void language sql security definer set search_path = '' as $$
  select public.reset_language_progress(p_language, p_system, p_reset_streak);
$$;

-- Offline rewards must be bound to the account that queued them. A request
-- already in flight while auth changes cannot turn account A's completion into
-- a reward for account B. The legacy endpoint remains unchanged.
create or replace function public.claim_story_reward_v2(
  p_language text, p_system text, p_claim_date date, p_story_id uuid, p_user_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    raise exception 'Not authenticated as reward owner' using errcode = '42501';
  end if;
  perform public.review_learner_lock(p_user_id);
  return public.claim_story_reward(p_language, p_system, p_claim_date, p_story_id);
end;
$$;

-- Explicitly remove Supabase default function grants as well as PUBLIC.
revoke all on function public.review_card_snapshot(jsonb) from public, anon, authenticated;
revoke all on function public.review_learner_lock(uuid) from public, anon, authenticated;
revoke all on function public.guard_review_generation() from public, anon, authenticated;
revoke all on function public.advance_card_revision() from public, anon, authenticated;
revoke all on function public.grade_card_v2(uuid, uuid, jsonb, jsonb, date, uuid, jsonb, uuid, bigint) from public, anon, authenticated;
revoke all on function public.undo_grade_v2(uuid, uuid) from public, anon, authenticated;
revoke all on function public.grade_card(uuid, jsonb, uuid, jsonb, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.reset_language_progress(text, text, boolean) from public, anon, authenticated;
revoke all on function public.reset_current_language_progress(text, text, boolean) from public, anon, authenticated;
grant execute on function public.grade_card_v2(uuid, uuid, jsonb, jsonb, date, uuid, jsonb, uuid, bigint) to authenticated;
grant execute on function public.undo_grade_v2(uuid, uuid) to authenticated;
grant execute on function public.grade_card(uuid, jsonb, uuid, jsonb, jsonb, uuid) to authenticated;
grant execute on function public.reset_language_progress(text, text, boolean) to authenticated;
grant execute on function public.reset_current_language_progress(text, text, boolean) to authenticated;
revoke all on function public.claim_story_reward_v2(text, text, date, uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_story_reward_v2(text, text, date, uuid, uuid) to authenticated;
notify pgrst, 'reload schema';
