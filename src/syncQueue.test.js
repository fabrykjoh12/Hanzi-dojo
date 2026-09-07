import { describe, it, expect, beforeEach, vi } from 'vitest'

// In-memory stand-in for the IndexedDB outbox so flushOutbox can be exercised.
// `deletes` counts them and `failDeleteAfter` makes the store throw mid-loop.
// That is NOT how the real store fails — offline.js's tx() resolves a fallback
// on every storage error rather than rejecting — so what the spec using it
// proves is the loop's arithmetic (the counter is outside the try, so a throw
// cannot discard what already went), not a production scenario. Said here
// because an earlier version of this comment claimed it modelled "the way a
// real IndexedDB failure would be", which it does not.
const store = vi.hoisted(() => ({ rows: [], nextId: 1, deletes: 0, failDeleteAfter: null }))
vi.mock('./offline', () => ({
  outboxAdd: async (op) => { const id = store.nextId++; store.rows.push({ id, op }); return id },
  outboxAll: async () => store.rows.slice(),
  outboxDelete: async (id) => {
    if (store.failDeleteAfter != null && store.deletes >= store.failDeleteAfter) {
      throw new Error('outbox store is gone')
    }
    store.deletes += 1
    store.rows = store.rows.filter(r => r.id !== id)
  },
  outboxCount: async () => store.rows.length,
}))

import {
  dayCountsOf, nextActivityCounts, isMissingRpc, newOpId,
  gradeCardWrite, resetGradeRpcProbe, enqueueGrade, flushOutbox,
  enqueueStoryRead, enqueueStoryClaim, enqueueAnalytics,
  queuedOpBelongsToTrack, dropQueuedWritesForTrack,
  opIsReplayableBy, pendingWrites,
} from './syncQueue'

// ── A minimal chainable Supabase double ─────────────────────────────────────
// Records every write so tests can assert what actually hit the network.
const RPC_ABSENT = { code: 'PGRST202', message: 'Could not find the function public.grade_card in the schema cache' }

function fakeSupabase(opts = {}) {
  const calls = { rpc: [], update: [], insert: [], upsert: [], select: [] }
  const rpcImpl = opts.rpc || (() => ({ data: null, error: RPC_ABSENT }))

  function from(table) {
    const ctx = { filters: {} }
    // A terminal builder: awaitable, and still chainable the way postgrest is
    // (.eq / .select / .single after an update or insert).
    const settled = (value) => {
      const b = {
        then: (res, rej) => Promise.resolve(value).then(res, rej),
        eq: (k, v) => { ctx.filters[k] = v; return b },
        select: () => b,
        single: () => Promise.resolve(value),
        maybeSingle: () => Promise.resolve(value),
      }
      return b
    }
    const api = {
      update(vals) { calls.update.push({ table, vals, filters: ctx.filters }); return settled({ data: null, error: opts.updateError || null }) },
      insert(vals) {
        calls.insert.push({ table, vals })
        const id = table === 'review_logs' ? 'log-legacy' : (opts.newCardId || 'card-new')
        return settled({ data: { id }, error: opts.insertError || null })
      },
      upsert(vals, o) { calls.upsert.push({ table, vals, opts: o }); return settled({ data: null, error: null }) },
      select() { calls.select.push({ table }); return api },
      eq(k, v) { ctx.filters[k] = v; return api },
      maybeSingle() { return Promise.resolve({ data: opts.existingCard || null, error: null }) },
      single() { return Promise.resolve({ data: null, error: null }) },
      then: (res, rej) => Promise.resolve({ data: null, error: null }).then(res, rej),
    }
    return api
  }

  return {
    calls,
    from,
    rpc: async (fn, args) => { calls.rpc.push({ fn, args }); return rpcImpl(args) },
  }
}

const UPDATES = { state: 'review', interval_days: 4, due_at: '2026-07-26T09:00:00.000Z' }
const LOG = { grade: 2, previous_state: 'learning', next_state: 'review' }

beforeEach(() => {
  store.rows = []
  store.nextId = 1
  store.deletes = 0
  store.failDeleteAfter = null
  resetGradeRpcProbe()
})

describe('dayCountsOf', () => {
  it('buckets grade ops per day and state', () => {
    const ops = [
      { kind: 'grade', day: '2026-07-05', state: 'new' },
      { kind: 'grade', day: '2026-07-05', state: 'review' },
      { kind: 'grade', day: '2026-07-05', state: 'learning' },
      { kind: 'grade', day: '2026-07-06', state: 'new' },
      { kind: 'storyRead', day: '2026-07-05' }, // ignored
    ]
    const d = dayCountsOf(ops)
    expect(d['2026-07-05']).toEqual({ studied: 3, new: 1, learning: 1, review: 1 })
    expect(d['2026-07-06']).toEqual({ studied: 1, new: 1, learning: 0, review: 0 })
  })

  it('treats relearning as learning bucket', () => {
    const d = dayCountsOf([{ kind: 'grade', day: 'x', state: 'relearning' }])
    expect(d.x).toEqual({ studied: 1, new: 0, learning: 1, review: 0 })
  })
})

describe('nextActivityCounts', () => {
  it('adds one to studied and to the bucket for the card state', () => {
    const start = { studied: 0, newC: 0, learn: 0, review: 0 }
    expect(nextActivityCounts(start, 'new')).toEqual({ studied: 1, newC: 1, learn: 0, review: 0 })
    expect(nextActivityCounts(start, 'review')).toEqual({ studied: 1, newC: 0, learn: 0, review: 1 })
    expect(nextActivityCounts(start, 'learning')).toEqual({ studied: 1, newC: 0, learn: 1, review: 0 })
    expect(nextActivityCounts(start, 'relearning')).toEqual({ studied: 1, newC: 0, learn: 1, review: 0 })
  })

  it('is pure — the caller keeps its counts until the write lands', () => {
    const cur = { studied: 3, newC: 1, learn: 1, review: 1 }
    const next = nextActivityCounts(cur, 'new')
    expect(cur).toEqual({ studied: 3, newC: 1, learn: 1, review: 1 })
    expect(next.studied).toBe(4)
  })

  it('tolerates a missing starting tally', () => {
    expect(nextActivityCounts(undefined, 'new')).toEqual({ studied: 1, newC: 1, learn: 0, review: 0 })
  })
})

describe('isMissingRpc', () => {
  it('recognises an undeployed function', () => {
    expect(isMissingRpc(RPC_ABSENT)).toBe(true)
    expect(isMissingRpc({ code: '404' })).toBe(true)
    expect(isMissingRpc({ message: 'function public.grade_card(...) does not exist' })).toBe(true)
  })

  it('does not swallow real failures', () => {
    expect(isMissingRpc(null)).toBe(false)
    expect(isMissingRpc({ code: '42501', message: 'new row violates row-level security policy' })).toBe(false)
    expect(isMissingRpc({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(false)
  })
})

describe('newOpId', () => {
  it('returns distinct uuid-shaped ids', () => {
    const a = newOpId()
    const b = newOpId()
    expect(a).not.toBe(b)
    expect(a.length).toBe(36)
    expect(a.split('-').length).toBe(5)
  })
})

describe('gradeCardWrite — RPC path', () => {
  const okRpc = () => ({ data: { card_id: 'card-1', log_id: 'log-1', already_applied: false }, error: null })

  it('sends the whole grade to grade_card in one call', async () => {
    const sb = fakeSupabase({ rpc: okRpc })
    const res = await gradeCardWrite(sb, {
      userId: 'u1', cardId: 'card-1', vocabId: 'v1', updates: UPDATES, log: LOG,
      activity: { mode: 'set', date: '2026-07-22', studied: 1, new: 0, learning: 0, review: 1 },
      opId: 'op-1',
    })
    expect(res).toMatchObject({ ok: true, cardId: 'card-1', logId: 'log-1', viaRpc: true, activityWritten: true })
    expect(sb.calls.rpc).toHaveLength(1)
    expect(sb.calls.rpc[0].fn).toBe('grade_card')
    expect(sb.calls.rpc[0].args).toMatchObject({ p_card_id: 'card-1', p_vocab_id: 'v1', p_op_id: 'op-1' })
    // No separate table writes — that is the whole point of the change.
    expect(sb.calls.update).toHaveLength(0)
    expect(sb.calls.insert).toHaveLength(0)
    expect(sb.calls.upsert).toHaveLength(0)
  })

  it('reports whether it created the card row, so undo cannot delete another device\'s', async () => {
    const created = fakeSupabase({ rpc: () => ({ data: { card_id: 'c1', inserted: true }, error: null }) })
    expect((await gradeCardWrite(created, { vocabId: 'v1', updates: UPDATES })).inserted).toBe(true)

    resetGradeRpcProbe()
    const raced = fakeSupabase({ rpc: () => ({ data: { card_id: 'c1', inserted: false }, error: null }) })
    expect((await gradeCardWrite(raced, { vocabId: 'v1', updates: UPDATES })).inserted).toBe(false)
  })

  it('never sends a client-supplied user id to the RPC', async () => {
    const sb = fakeSupabase({ rpc: okRpc })
    await gradeCardWrite(sb, { userId: 'u1', cardId: 'c1', vocabId: 'v1', updates: UPDATES, opId: 'op-1' })
    const keys = Object.keys(sb.calls.rpc[0].args)
    expect(keys.some(k => k.indexOf('user') !== -1)).toBe(false)
  })

  it('reports an already-applied replay without writing again', async () => {
    const sb = fakeSupabase({ rpc: () => ({ data: { card_id: 'card-1', log_id: 'log-1', already_applied: true }, error: null }) })
    const res = await gradeCardWrite(sb, { cardId: 'card-1', vocabId: 'v1', updates: UPDATES, opId: 'op-1' })
    expect(res.alreadyApplied).toBe(true)
    expect(res.ok).toBe(true)
    expect(sb.calls.update).toHaveLength(0)
  })

  it('surfaces a real RPC error instead of quietly falling back', async () => {
    const rls = { code: '42501', message: 'row-level security' }
    const sb = fakeSupabase({ rpc: () => ({ data: null, error: rls }) })
    const res = await gradeCardWrite(sb, { cardId: 'card-1', vocabId: 'v1', updates: UPDATES })
    expect(res.ok).toBe(false)
    expect(res.error).toBe(rls)
    expect(sb.calls.update).toHaveLength(0)
  })
})

describe('gradeCardWrite — migration not applied yet', () => {
  it('falls back to the previous separate writes', async () => {
    const sb = fakeSupabase() // rpc missing by default
    const res = await gradeCardWrite(sb, {
      userId: 'u1', cardId: 'card-1', vocabId: 'v1', updates: UPDATES, log: LOG,
      activity: { mode: 'set', date: '2026-07-22', studied: 2, new: 1, learning: 0, review: 1 },
      opId: 'op-1',
    })
    expect(res.ok).toBe(true)
    expect(res.viaRpc).toBe(false)
    expect(res.cardId).toBe('card-1')
    expect(sb.calls.update).toEqual([{ table: 'cards', vals: UPDATES, filters: { id: 'card-1' } }])
    expect(sb.calls.insert.map(c => c.table)).toEqual(['review_logs'])
    expect(sb.calls.upsert[0]).toMatchObject({
      table: 'daily_activity',
      vals: { activity_date: '2026-07-22', studied_cards: 2, new_cards: 1, learning_cards: 0, review_cards: 1 },
    })
    await expect(res.pendingLogId).resolves.toBe('log-legacy')
  })

  it('treats a backend that answers the call but does nothing as absent', async () => {
    const sb = fakeSupabase({ rpc: () => ({ data: null, error: null }) })
    const res = await gradeCardWrite(sb, { userId: 'u1', cardId: 'c1', vocabId: 'v1', updates: UPDATES })
    expect(res.ok).toBe(true)
    expect(res.viaRpc).toBe(false)
    expect(sb.calls.update).toHaveLength(1)
  })

  it('inserts a first-seen card, de-duped on (user_id, vocab_id)', async () => {
    const sb = fakeSupabase({ newCardId: 'card-fresh' })
    const res = await gradeCardWrite(sb, { userId: 'u1', cardId: null, vocabId: 'v9', updates: UPDATES })
    expect(res.cardId).toBe('card-fresh')
    expect(sb.calls.insert[0]).toMatchObject({ table: 'cards', vals: { user_id: 'u1', vocab_id: 'v9' } })
  })

  it('updates instead of duplicating when the card already exists', async () => {
    const sb = fakeSupabase({ existingCard: { id: 'card-existing' } })
    const res = await gradeCardWrite(sb, { userId: 'u1', cardId: null, vocabId: 'v9', updates: UPDATES })
    expect(res.cardId).toBe('card-existing')
    expect(sb.calls.insert.filter(c => c.table === 'cards')).toHaveLength(0)
    expect(sb.calls.update).toEqual([{ table: 'cards', vals: UPDATES, filters: { id: 'card-existing' } }])
  })

  it('fails the grade when the card write fails', async () => {
    const err = { message: 'network' }
    const sb = fakeSupabase({ updateError: err })
    const res = await gradeCardWrite(sb, { userId: 'u1', cardId: 'c1', vocabId: 'v1', updates: UPDATES })
    expect(res.ok).toBe(false)
    expect(res.error).toBe(err)
  })

  it('stops re-probing the missing RPC on every grade', async () => {
    const sb = fakeSupabase()
    await gradeCardWrite(sb, { userId: 'u1', cardId: 'c1', vocabId: 'v1', updates: UPDATES })
    await gradeCardWrite(sb, { userId: 'u1', cardId: 'c2', vocabId: 'v2', updates: UPDATES })
    expect(sb.calls.rpc).toHaveLength(1)
    expect(sb.calls.update).toHaveLength(2)
  })
})

describe('offline replay', () => {
  const queued = () => enqueueGrade({
    userId: 'u1', vocabId: 'v1', cardId: 'card-1', updates: UPDATES, log: LOG,
    day: '2026-07-22', state: 'review',
  })

  it('stamps every queued grade with a stable op id', async () => {
    await queued()
    expect(store.rows[0].op.opId).toBeTruthy()
    expect(store.rows[0].op.opId).not.toBe(store.rows[0].op.userId)
  })

  it('replays through the same RPC, carrying the op id and a +1 increment', async () => {
    await queued()
    const opId = store.rows[0].op.opId
    const sb = fakeSupabase({ rpc: () => ({ data: { card_id: 'card-1', log_id: 'log-1', already_applied: false }, error: null }) })

    const out = await flushOutbox(sb, 'u1')
    expect(out.flushed).toBe(1)
    expect(store.rows).toHaveLength(0)
    expect(sb.calls.rpc[0].fn).toBe('grade_card')
    expect(sb.calls.rpc[0].args.p_op_id).toBe(opId)
    expect(sb.calls.rpc[0].args.p_activity).toEqual({
      mode: 'increment', date: '2026-07-22', studied: 1, new: 0, learning: 0, review: 1,
    })
    // The RPC wrote the day counts, so no second reconcile pass.
    expect(sb.calls.upsert.filter(c => c.table === 'daily_activity')).toHaveLength(0)
  })

  it('is idempotent — a re-queued grade with the same op id writes once', async () => {
    await queued()
    const op = store.rows[0].op

    let applied = 0
    const rpc = (args) => {
      // Mirrors the RPC: the dedupe key short-circuits a repeat.
      if (args.p_op_id === op.opId && applied > 0) {
        return { data: { card_id: 'card-1', log_id: 'log-1', already_applied: true }, error: null }
      }
      applied += 1
      return { data: { card_id: 'card-1', log_id: 'log-1', already_applied: false }, error: null }
    }

    const sb = fakeSupabase({ rpc })
    await flushOutbox(sb, 'u1')
    // The op survived the flush (an outbox delete that never landed) and is
    // replayed on the next reconnect.
    store.rows.push({ id: 99, op })
    await flushOutbox(sb, 'u1')

    expect(sb.calls.rpc).toHaveLength(2)
    expect(applied).toBe(1)                  // written exactly once
    expect(sb.calls.insert).toHaveLength(0)  // never a duplicate review log
    expect(sb.calls.upsert).toHaveLength(0)  // never a double-counted day
  })

  it('reconciles under the signed-in account, not one scavenged off an op', async () => {
    // The discriminating fixture: an op that names NO user, flushed as u1, with
    // the RPC absent so the legacy reconcile path runs. The old code took the
    // userId off the last replayed op — null here, so `unreconciled.length > 0
    // && userId` was false and it reconciled nothing at all. The new code
    // reconciles under the account doing the flushing.
    //
    // Every other reconcile spec in this file uses an op whose userId already
    // equals the signed-in account, so none of them can tell the two apart.
    store.rows.push({ id: 901, op: {
      kind: 'grade', vocabId: 'v1', cardId: 'card-1', updates: UPDATES, log: LOG,
      day: '2026-07-22', state: 'review', opId: 'op-ownerless',
    } })
    const sb = fakeSupabase() // no grade_card, so the legacy path reconciles

    await flushOutbox(sb, 'u1')

    const activity = sb.calls.upsert.filter(c => c.table === 'daily_activity')
    expect(activity).toHaveLength(1)
    expect(activity[0].vals).toMatchObject({ user_id: 'u1', activity_date: '2026-07-22' })
  })

  it('keeps the old bulk reconcile when the RPC is absent', async () => {
    await queued()
    const sb = fakeSupabase() // no grade_card

    const out = await flushOutbox(sb, 'u1')
    expect(out.flushed).toBe(1)
    expect(sb.calls.update[0]).toMatchObject({ table: 'cards' })
    const activity = sb.calls.upsert.filter(c => c.table === 'daily_activity')
    expect(activity).toHaveLength(1)
    // Pins the user_id, which nothing did before. It does NOT discriminate
    // between the signed-in account and the old scavenged one — this op's
    // userId is already 'u1', so both implementations produce this assertion.
    // The spec above ("reconciles under the signed-in account") is the one that
    // tells them apart, using an ownerless op; this is here so the field is
    // pinned at all.
    //
    // And a foreign account's id can no longer reach reconcile by any route:
    // flushOutbox skips an op that fails opIsReplayableBy, so everything left
    // carries this account's id or none.
    expect(activity[0].vals).toMatchObject({
      user_id: 'u1', activity_date: '2026-07-22', studied_cards: 1, review_cards: 1,
    })
  })

  it('never replays another account\'s queued write as this account', async () => {
    // The half the reset's drop cannot do. dropQueuedWritesForTrack KEEPS an op
    // that names another account, because destroying it would be a loss with no
    // matching deletion — but grade_card writes under auth.uid() and ignores
    // op.userId, so replaying it here would insert account A's card, at A's
    // reps and stability, into account B. The outbox is one store per device
    // and sign-out never clears it, so nothing unusual has to happen.
    await queued()
    store.rows.push({ id: 42, op: { kind: 'grade', userId: 'someone-else', vocabId: 'v9', cardId: null, updates: { reps: 9, stability: 40 }, opId: 'op-x' } })
    const sb = fakeSupabase({ rpc: () => ({ data: { card_id: 'c', log_id: 'l', already_applied: false }, error: null }) })

    const out = await flushOutbox(sb, 'u1')

    expect(out.flushed).toBe(1)
    expect(sb.calls.rpc).toHaveLength(1)              // only u1's grade was sent
    expect(store.rows.map(r => r.op.userId)).toEqual(['someone-else'])  // held, not dropped
  })

  it('still replays an op that names no account', async () => {
    // Analytics ops are enqueued without an owner, and an unrecognised row has
    // to drain rather than wedge the queue behind it.
    await enqueueAnalytics({ name: 'x' })
    store.rows.push({ id: 43, op: null })
    const sb = fakeSupabase()

    const out = await flushOutbox(sb, 'u1')

    expect(out.flushed).toBe(2)
    expect(store.rows).toHaveLength(0)
  })

  it('refuses to flush at all when it cannot say which account it is for', async () => {
    await queued()
    const sb = fakeSupabase({ rpc: () => ({ data: { card_id: 'c', log_id: 'l' }, error: null }) })

    expect(await flushOutbox(sb, null)).toEqual({ flushed: 0 })
    expect(sb.calls.rpc).toHaveLength(0)
    expect(store.rows).toHaveLength(1)
  })

  it('counts pending writes per account, and per device when asked', async () => {
    // The sync bar shows the signed-in learner's work; Settings' offline-storage
    // card is about what is on the DEVICE, so it keeps the whole count.
    await queued()
    store.rows.push({ id: 44, op: { kind: 'grade', userId: 'someone-else', vocabId: 'v9', updates: {} } })

    expect(await pendingWrites('u1')).toBe(1)
    expect(await pendingWrites()).toBe(2)
  })

  it('decides replayability from the signed-in account', () => {
    // Named for what it actually exercises. It used to be called "replays under
    // the signed-in account, not the last op it happened to see" and to talk
    // about the reconcile pass, which it never touched — that claim is asserted
    // by the reconcile spec above, which now pins the user_id the upsert
    // carries.
    expect(opIsReplayableBy({ kind: 'grade', userId: 'u1' }, 'u1')).toBe(true)
    expect(opIsReplayableBy({ kind: 'grade', userId: 'u2' }, 'u1')).toBe(false)
    expect(opIsReplayableBy({ kind: 'analytics', event: {} }, 'u1')).toBe(true)
    expect(opIsReplayableBy(null, 'u1')).toBe(true)
    expect(opIsReplayableBy({ kind: 'grade', userId: 'u1' }, null)).toBe(false)
  })

  it('leaves a failed op in the outbox and does not count its day', async () => {
    await queued()
    const sb = fakeSupabase({ rpc: () => ({ data: null, error: { code: '42501', message: 'rls' } }) })

    const out = await flushOutbox(sb, 'u1')
    expect(out.flushed).toBe(0)
    expect(store.rows).toHaveLength(1)
    expect(sb.calls.upsert).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// FAB-28 finding 4: a reset must not leave queued writes for deleted rows.
// ---------------------------------------------------------------------------
// reset_language_progress DELETES this track's cards and review_logs, and also
// its story_reads, story_unlocks and story_reward_claims. outboxClear() existed
// and was called from exactly one place — account deletion — so every reset
// path left the outbox untouched. Replaying one of those ops either recreates
// what the reset deleted (a grade op with cardId: null takes grade_card's
// INSERT branch; a storyRead upserts the read back; a storyClaim re-runs the
// reward RPC) or wedges the queue forever on 'Card not found'.
describe("a progress reset drops that track's queued writes, and only those", () => {
  const CN = { language: 'chinese', system: 'hsk_3' }
  const JA = { language: 'japanese', system: 'jlpt' }

  const U = 'user-a'
  const OTHER_USER = 'user-b'

  const grade = (over = {}) => ({
    kind: 'grade', userId: U, vocabId: 'v1', cardId: 'c1',
    updates: {}, opId: 'op-1', ...over,
  })
  // The predicate now takes the signed-in user too. gradeU() spells the common
  // "this user's op, judged for this user" case so the track cases below stay
  // about the track.
  const gradeU = (over, track) => queuedOpBelongsToTrack(grade(over), track, U)

  // ── The rule ──────────────────────────────────────────────────────────────

  it('drops a queued grade for the track being reset', () => {
    expect(gradeU({ ...CN }, CN)).toBe(true)
  })

  it("keeps another language's queued grade", () => {
    // The reason this is a predicate and not outboxClear(): a reset is
    // per-language, and discarding another track's unsynced grades to tidy up
    // this one trades a silent bug for silent data loss.
    expect(gradeU({ ...JA }, CN)).toBe(false)
  })

  it('keeps a grade for the same language on a different system', () => {
    expect(gradeU({ language: 'chinese', system: 'other' }, CN)).toBe(false)
  })

  it('drops a queued story read and story claim for this track', () => {
    // The correction to the first version of this change, which dropped only
    // `grade` ops because "the other kinds are not writes against cards, so the
    // delete cannot strand them". The reset deletes story_reads, story_unlocks
    // and story_reward_claims too, and both of these put them straight back.
    expect(queuedOpBelongsToTrack({ kind: 'storyRead', storyId: 's1', userId: U, ...CN }, CN, U)).toBe(true)
    expect(queuedOpBelongsToTrack({ kind: 'storyClaim', claimDate: '2026-09-07', userId: U, ...CN }, CN, U)).toBe(true)
  })

  it("keeps another track's story read and story claim", () => {
    expect(queuedOpBelongsToTrack({ kind: 'storyRead', storyId: 's1', userId: U, ...JA }, CN, U)).toBe(false)
    expect(queuedOpBelongsToTrack({ kind: 'storyClaim', claimDate: '2026-09-07', userId: U, ...JA }, CN, U)).toBe(false)
  })

  it('never drops an analytics op', () => {
    // analytics_events is not in the reset's delete list, and the queue treats
    // analytics as lossy telemetry rather than learner state. Dropping it here
    // would discard events that describe the reset itself.
    expect(queuedOpBelongsToTrack({ kind: 'analytics', event: {}, userId: U, ...CN }, CN, U)).toBe(false)
  })

  it('judges a partially-tagged op by the tag it actually carries', () => {
    // Both obvious spellings get this wrong in one direction:
    //   `!op.language && !op.system` calls the first case tagged, then fails
    //   the equality test — so an op that plainly IS this track's survives.
    expect(gradeU({ language: 'chinese' }, CN)).toBe(true)
    expect(gradeU({ system: 'hsk_3' }, CN)).toBe(true)
    //   `!op.language || !op.system` calls the next case untagged and drops it
    //   — destroying an unsynced write that is plainly NOT this track's.
    expect(gradeU({ language: 'japanese' }, CN)).toBe(false)
    expect(gradeU({ system: 'jlpt' }, CN)).toBe(false)
  })

  it('drops an UNTAGGED op, deliberately', () => {
    // One enqueued before the stamp existed and not yet flushed. It cannot be
    // attributed, so the choice is between possibly discarding another track's
    // unsynced write and possibly resurrecting progress the learner explicitly
    // asked to delete. A reset is explicit, confirmed and destructive;
    // silently undoing part of it is the worse failure.
    expect(gradeU({}, CN)).toBe(true)
  })

  it('drops nothing when the track is unknown', () => {
    // A caller with no track must not accidentally empty the queue.
    expect(gradeU({ ...CN }, null)).toBe(false)
    expect(gradeU({ ...CN }, {})).toBe(false)
    expect(gradeU({ ...CN }, { language: 'chinese' })).toBe(false)
  })

  it("keeps another ACCOUNT's queued write, even on the very track being reset", () => {
    // The outbox is one IndexedDB store per origin, not per account, and an
    // ordinary sign-out never clears it — outboxClear() runs only on account
    // deletion. So two accounts that have used the same device share a queue.
    // The reset RPC deletes only auth.uid()'s rows, so a drop that ignored the
    // user would destroy another account's durable writes while that account's
    // cards still exist on the server: a loss with no matching deletion.
    expect(queuedOpBelongsToTrack(grade({ ...CN, userId: OTHER_USER }), CN, U)).toBe(false)
    expect(queuedOpBelongsToTrack({ kind: 'storyRead', storyId: 's1', userId: OTHER_USER, ...CN }, CN, U)).toBe(false)
  })

  it('keeps an op that names no account at all', () => {
    // The opposite default to the language tag, deliberately: userId has been
    // on every LEARNER op since the queue existed — analytics carries none and
    // never has (enqueueAnalytics stores the event, not an owner) — so for the
    // three kinds this rule governs, its absence is not a one-version window to
    // trade away, and the op may be another account's.
    expect(queuedOpBelongsToTrack(grade({ ...CN, userId: undefined }), CN, U)).toBe(false)
  })

  it('drops nothing when the caller cannot name the account', () => {
    expect(queuedOpBelongsToTrack(grade({ ...CN }), CN, null)).toBe(false)
    expect(queuedOpBelongsToTrack(grade({ ...CN }), CN, undefined)).toBe(false)
    // The case a bare `op.userId !== userId` gets wrong: two undefineds are
    // equal, so an unattributable op would match an unattributable caller and
    // be deleted. That is why the guard tests `userId` on its own.
    expect(queuedOpBelongsToTrack(grade({ ...CN, userId: undefined }), CN, undefined)).toBe(false)
  })

  // Two specs stood here, named for the bug's two failure modes — "covers the op
  // that RESURRECTS a deleted card" and "covers the op that WEDGES the queue".
  // They varied only cardId and updates, which the predicate never reads, so
  // neither could fail without the first spec in this block failing too: they
  // were documentation wearing a spec's name, and counting them as coverage of
  // those two modes was the overstatement. The modes themselves are covered
  // where the behaviour actually differs — cardId: null against the real
  // deletion loop below, and the whole point of the header comment above.

  // ── The function that actually destroys queued writes ─────────────────────
  //
  // These go through the real enqueue helpers against the in-memory outbox, so
  // they also prove the helpers carry the tags into the STORED op — each is a
  // `...op` spread, and a predicate that is right about ops nothing produces
  // would fix nothing. What they cannot reach is the JSX call sites that pass
  // the track in (Study.jsx, useStoryReaderCore.js, StoryReaderImmersive.jsx,
  // storyRewardData.js); an op arriving untagged from one of those is covered
  // only by the untagged rule above.

  it("deletes this track's queued writes from the outbox and leaves the rest", async () => {
    await enqueueGrade({ userId: U, vocabId: 'v1', cardId: 'c1', updates: {}, ...CN })
    await enqueueGrade({ userId: U, vocabId: 'v9', cardId: 'c9', updates: {}, ...JA })
    await enqueueStoryRead({ userId: U, storyId: 's9', ...JA })

    const dropped = await dropQueuedWritesForTrack(CN, U)

    expect(dropped).toBe(1)
    expect(store.rows.map(r => [r.op.kind, r.op.language])).toEqual([
      ['grade', 'japanese'], ['storyRead', 'japanese'],
    ])
  })

  it('deletes every kind the reset deletes, and keeps analytics', async () => {
    await enqueueGrade({ userId: U, vocabId: 'v1', cardId: null, updates: {}, ...CN })
    await enqueueStoryRead({ userId: U, storyId: 's1', ...CN })
    await enqueueStoryClaim({ userId: U, storyId: 's1', claimDate: '2026-09-07', ...CN })
    // Hand-built, not enqueueAnalytics(): that helper stores { kind, event } with
    // no top-level userId, so the op would be refused by the USER guard whether
    // or not 'analytics' is in RESET_DELETED_OP_KINDS — and this spec would then
    // pass under the very mutation it is named for. An earlier version made
    // exactly that mistake, and the mutation table reported a kill it had not
    // earned. This row names the user, so only the kind filter can save it.
    store.rows.push({ id: 900, op: { kind: 'analytics', userId: U, event: { name: 'progress_reset' }, ...CN } })
    await enqueueGrade({ userId: U, vocabId: 'v9', cardId: 'c9', updates: {}, ...JA })

    const dropped = await dropQueuedWritesForTrack(CN, U)

    expect(dropped).toBe(3)
    expect(store.rows.map(r => r.op.kind)).toEqual(['analytics', 'grade'])
  })

  it('keeps the count it had when a throwing store interrupts the loop', async () => {
    // Named for what it proves: the counter lives outside the try, so a throw
    // cannot discard the deletes that already went. It is NOT a claim about
    // production — offline.js's tx() resolves a fallback on every storage error
    // rather than rejecting, so the real store never reaches this path and the
    // count there is an upper bound (see the docstring). An earlier version of
    // this comment sold it as "a caller reporting the count would have reported
    // a lie", which is a guarantee this function does not have.
    await enqueueGrade({ userId: U, vocabId: 'v1', cardId: 'c1', updates: {}, ...CN })
    await enqueueGrade({ userId: U, vocabId: 'v2', cardId: 'c2', updates: {}, ...CN })
    store.failDeleteAfter = 1

    expect(await dropQueuedWritesForTrack(CN, U)).toBe(1)
    expect(store.rows).toHaveLength(1)
  })

  it("leaves another account's queued writes in the shared outbox", async () => {
    // The device-level version of the predicate spec above: two accounts have
    // signed in here, and only the one doing the reset loses its queued writes.
    await enqueueGrade({ userId: U, vocabId: 'v1', cardId: 'c1', updates: {}, ...CN })
    await enqueueGrade({ userId: OTHER_USER, vocabId: 'v2', cardId: 'c2', updates: {}, ...CN })
    await enqueueStoryRead({ userId: OTHER_USER, storyId: 's1', ...CN })

    expect(await dropQueuedWritesForTrack(CN, U)).toBe(1)
    expect(store.rows.map(r => [r.op.kind, r.op.userId])).toEqual([
      ['grade', OTHER_USER], ['storyRead', OTHER_USER],
    ])
  })

  it('touches nothing when the caller cannot name the account', async () => {
    await enqueueGrade({ userId: U, vocabId: 'v1', cardId: 'c1', updates: {}, ...CN })
    expect(await dropQueuedWritesForTrack(CN, null)).toBe(0)
    expect(store.rows).toHaveLength(1)
  })

  it('touches nothing when the caller has no track', async () => {
    await enqueueGrade({ userId: U, vocabId: 'v1', cardId: 'c1', updates: {}, ...CN })
    expect(await dropQueuedWritesForTrack(null, U)).toBe(0)
    expect(store.rows).toHaveLength(1)
  })
})
