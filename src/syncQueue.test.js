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

describe('gradeCardWrite — missing service fails closed', () => {
  it('does not split scheduling, logs and activity into separate writes', async () => {
    const sb = fakeSupabase()
    expect((await gradeCardWrite(sb, { userId: 'u1', cardId: 'c1', vocabId: 'v1', updates: UPDATES, log: LOG })).ok).toBe(false)
    expect(sb.calls.update).toHaveLength(0)
    expect(sb.calls.insert).toHaveLength(0)
    expect(sb.calls.upsert).toHaveLength(0)
  })
  it('rejects a response without a confirmed card', async () => {
    const sb = fakeSupabase({ rpc: () => ({ data: null, error: null }) })
    expect((await gradeCardWrite(sb, { cardId: 'c1', updates: UPDATES })).ok).toBe(false)
    expect(sb.calls.update).toHaveLength(0)
  })
})

describe('owner-scoped offline replay', () => {
  it('retains legacy grades because they have no expected revision or reset generation', async () => {
    await enqueueGrade({ userId: 'u1', vocabId: 'v1', updates: UPDATES })
    const sb = fakeSupabase()
    expect((await flushOutbox(sb, 'u1')).flushed).toBe(0)
    expect(store.rows).toHaveLength(1)
    expect(sb.calls.rpc).toHaveLength(0)
    expect(sb.calls.update).toHaveLength(0)
  })
  it('requires an explicitly signed-in owner', async () => {
    store.rows.push({ id: 1, op: { kind: 'storyRead', userId: 'u1', storyId: 's1' } })
    const sb = fakeSupabase()
    expect((await flushOutbox(sb)).flushed).toBe(0)
    expect(sb.calls.upsert).toHaveLength(0)
  })
  it('leaves other-account and ownerless operations intact', async () => {
    store.rows.push(
      { id: 1, op: { kind: 'storyRead', userId: 'u2', storyId: 's1' } },
      { id: 2, op: { kind: 'analytics', event: { user_id: null } } },
      { id: 3, op: { kind: 'storyRead', userId: 'u1', storyId: 's2' } },
    )
    const sb = fakeSupabase()
    expect((await flushOutbox(sb, 'u1')).flushed).toBe(1)
    expect(store.rows.map(row => row.id)).toEqual([1, 2])
    expect(sb.calls.upsert[0].vals.user_id).toBe('u1')
  })
  it('rejects conflicting ownership fields even when one matches', async () => {
    store.rows.push({ id: 1, op: { kind: 'analytics', userId: 'u1', event: { user_id: 'u2' } } })
    const sb = fakeSupabase()
    expect((await flushOutbox(sb, 'u1')).flushed).toBe(0)
    expect(sb.calls.insert).toHaveLength(0)
  })
  it('replays only owned analytics, dropping a failed analytics write', async () => {
    store.rows.push({ id: 1, op: { kind: 'analytics', event: { user_id: 'u1' } } })
    const sb = fakeSupabase({ insertError: { message: 'offline' } })
    expect((await flushOutbox(sb, 'u1')).flushed).toBe(1)
    expect(store.rows).toHaveLength(0)
  })
})


it('queued story claims carry the original owner and survive an unavailable owner-safe RPC', async () => {
  store.rows.push({ id: 1, op: { kind: 'storyClaim', userId: 'u1', language: 'chinese', system: 'hsk_3', claimDate: '2026-09-28', storyId: 's1' } })
  const sb = fakeSupabase()
  expect((await flushOutbox(sb, 'u1')).flushed).toBe(0)
  expect(sb.calls.rpc[0]).toMatchObject({ fn: 'claim_story_reward_v2', args: { p_user_id: 'u1', p_claim_date: '2026-09-28' } })
  expect(store.rows).toHaveLength(1)
})
