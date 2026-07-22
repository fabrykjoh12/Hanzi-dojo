import { describe, it, expect, beforeEach, vi } from 'vitest'

// In-memory stand-in for the IndexedDB outbox so flushOutbox can be exercised.
const store = vi.hoisted(() => ({ rows: [], nextId: 1 }))
vi.mock('./offline', () => ({
  outboxAdd: async (op) => { const id = store.nextId++; store.rows.push({ id, op }); return id },
  outboxAll: async () => store.rows.slice(),
  outboxDelete: async (id) => { store.rows = store.rows.filter(r => r.id !== id) },
  outboxCount: async () => store.rows.length,
}))

import {
  dayCountsOf, nextActivityCounts, isMissingRpc, newOpId,
  gradeCardWrite, resetGradeRpcProbe, enqueueGrade, flushOutbox,
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

    const out = await flushOutbox(sb)
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
    await flushOutbox(sb)
    // The op survived the flush (an outbox delete that never landed) and is
    // replayed on the next reconnect.
    store.rows.push({ id: 99, op })
    await flushOutbox(sb)

    expect(sb.calls.rpc).toHaveLength(2)
    expect(applied).toBe(1)                  // written exactly once
    expect(sb.calls.insert).toHaveLength(0)  // never a duplicate review log
    expect(sb.calls.upsert).toHaveLength(0)  // never a double-counted day
  })

  it('keeps the old bulk reconcile when the RPC is absent', async () => {
    await queued()
    const sb = fakeSupabase() // no grade_card

    const out = await flushOutbox(sb)
    expect(out.flushed).toBe(1)
    expect(sb.calls.update[0]).toMatchObject({ table: 'cards' })
    const activity = sb.calls.upsert.filter(c => c.table === 'daily_activity')
    expect(activity).toHaveLength(1)
    expect(activity[0].vals).toMatchObject({ activity_date: '2026-07-22', studied_cards: 1, review_cards: 1 })
  })

  it('leaves a failed op in the outbox and does not count its day', async () => {
    await queued()
    const sb = fakeSupabase({ rpc: () => ({ data: null, error: { code: '42501', message: 'rls' } }) })

    const out = await flushOutbox(sb)
    expect(out.flushed).toBe(0)
    expect(store.rows).toHaveLength(1)
    expect(sb.calls.upsert).toHaveLength(0)
  })
})
