import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ rows: [], legacy: [], blocked: false }))
vi.mock('./offline', async importOriginal => {
  const actual = await importOriginal()
  const clone = value => structuredClone(value)
  return {
    ...actual,
    reviewRecords: async userId => clone(db.rows.filter(row => row.userId === userId)),
    outboxAll: async () => clone(db.legacy),
    reviewCreate: async intent => {
      if (db.blocked) throw new Error('storage blocked')
      const existing = db.rows.find(row => row.opId === intent.opId)
      if (existing) {
        if (existing.userId !== intent.userId) throw new Error('REVIEW_CONFLICT: foreign owner')
        return clone(existing)
      }
      if (db.rows.some(row => row.userId === intent.userId && row.intent.vocabId === intent.vocabId && ['pending', 'undo_pending', 'conflict'].includes(row.status))) throw new Error('REVIEW_CONFLICT: pending')
      const row = { opId: intent.opId, userId: intent.userId, intent: clone(intent), status: 'pending', version: 0, ordinal: db.rows.length + 1, card: null }
      db.rows.push(row)
      return clone(row)
    },
    reviewUpdate: async (opId, userId, patch, expected) => {
      if (db.blocked) throw new Error('storage blocked')
      const row = db.rows.find(item => item.opId === opId && item.userId === userId)
      if (!row) return null
      if (actual.sameReviewVersion(row, expected)) Object.assign(row, clone(patch), { version: row.version + 1 })
      return clone(row)
    },
    reviewDeleteMany: async (rows, userId) => {
      db.rows = db.rows.filter(row => row.userId !== userId || ['pending', 'undo_pending', 'retired'].includes(row.status) || actual.reviewRetiredIds(row).length || !rows.some(expected => actual.sameReviewVersion(row, expected)))
    },
  }
})
import { submitReview, undoReview, recoverReviews, pendingReviewVocabIds, pendingIntroductionCount, reconcileReviewCards, reviewBaseline, subscribeReviewChanges } from './reviewJournal'

const track = { language: 'chinese', system: 'hsk_3' }
const intent = (patch = {}) => ({ opId: 'op1', userId: 'u1', vocabId: 'v1', cardId: 'c1', generation: 0,
  ...track, level: 1, day: '2026-09-28', state: 'review', priorKnown: false,
  expected: { id: 'c1', revision: 1, state: 'review' }, updates: { state: 'review', reps: 2 }, log: { grade: 2 }, ...patch })
const card = (patch = {}) => ({ id: 'c1', vocab_id: 'v1', user_id: 'u1', revision: 2, state: 'review', reps: 2, ...patch })
const client = (handler = () => ({ data: { status: 'applied', card: card(), card_id: 'c1', log_id: 'l1' }, error: null })) => ({ rpc: vi.fn(handler), from: vi.fn(() => { throw new Error('No fallback allowed') }) })
const waitable = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }

beforeEach(() => { db.rows = []; db.legacy = []; db.blocked = false })

describe('durable immutable review delivery', () => {
  it('commits before making the request and sends the exact v2 contract', async () => {
    const sb = client((name, payload) => {
      expect(db.rows[0].status).toBe('pending')
      expect(name).toBe('grade_card_v2')
      expect(payload).toMatchObject({ p_op_id: 'op1', p_expected: { id: 'c1', revision: 1 }, p_generation: 0, p_user_id: 'u1', p_day: '2026-09-28' })
      return { data: { status: 'applied', card: card(), card_id: 'c1' } }
    })
    expect(await submitReview(sb, intent())).toMatchObject({ ok: true, status: 'applied', durable: true, cardId: 'c1' })
  })
  it('never sends when storage cannot commit', async () => {
    db.blocked = true
    const sb = client()
    expect(await submitReview(sb, intent())).toMatchObject({ ok: false, durable: false })
    expect(sb.rpc).not.toHaveBeenCalled()
  })
  it('advances offline only after durable pending storage', async () => {
    const sb = client()
    expect(await submitReview(sb, intent(), { online: false })).toMatchObject({ ok: true, pending: true, durable: true })
    expect(sb.rpc).not.toHaveBeenCalled()
    expect(await pendingReviewVocabIds('u1')).toEqual(new Set(['v1']))
  })
  it('holds an uncertain response and retries original grade, day, and snapshot', async () => {
    const sb = client(() => ({ error: { message: 'connection interrupted' } }))
    expect((await submitReview(sb, intent())).ok).toBe(false)
    sb.rpc.mockImplementation(() => ({ data: { status: 'applied', card: card(), already_applied: true } }))
    const saved = await submitReview(sb, intent({ day: '2026-09-29', log: { grade: 0 }, updates: { state: 'learning' } }))
    expect(saved.ok).toBe(true)
    expect(sb.rpc.mock.calls[1][1]).toEqual(sb.rpc.mock.calls[0][1])
  })
  it('fails closed for absent RPC and malformed success without separate writes', async () => {
    const sb = client(() => ({ error: { code: 'PGRST202' } }))
    expect(await submitReview(sb, intent())).toMatchObject({ ok: false, pending: true })
    sb.rpc.mockImplementation(() => ({ data: null }))
    expect(await submitReview(sb, intent())).toMatchObject({ ok: false, pending: true })
    expect(sb.from).not.toHaveBeenCalled()
  })
  it('marks stale generation/revision conflict terminal without resubmitting', async () => {
    const sb = client(() => ({ error: { code: '40001', message: 'REVIEW_CONFLICT: reset' } }))
    expect(await submitReview(sb, intent())).toMatchObject({ ok: false, status: 'conflict' })
    await recoverReviews(sb, 'u1')
    expect(sb.rpc).toHaveBeenCalledTimes(1)
  })
  it('retains a null-card replay as a tombstone rather than resurrecting it', async () => {
    const sb = client(() => ({ data: { status: 'applied', card: null, card_id: 'c1', already_applied: true } }))
    expect(await submitReview(sb, intent())).toMatchObject({ ok: false, status: 'conflict' })
    expect(await submitReview(sb, intent(), { online: false })).toMatchObject({ ok: false, status: 'conflict' })
    expect(await reconcileReviewCards('u1', [card({ revision: 1 })], track)).toEqual([])
  })
  it('does not recover another account or reuse its operation ID', async () => {
    await submitReview(client(), intent(), { online: false })
    const sb = client()
    expect(await recoverReviews(sb, 'u2')).toEqual([])
    expect(await submitReview(sb, intent({ userId: 'u2' }))).toMatchObject({ ok: false, status: 'conflict' })
    expect(sb.rpc).not.toHaveBeenCalled()
  })
  it('serializes concurrent recovery calls for one owner', async () => {
    await submitReview(client(), intent(), { online: false })
    const wait = waitable()
    const sb = client(() => wait.promise)
    const first = recoverReviews(sb, 'u1')
    const second = recoverReviews(sb, 'u1')
    expect(first).toBe(second)
    wait.resolve({ data: { status: 'applied', card: card() } })
    await first
    expect(sb.rpc).toHaveBeenCalledTimes(1)
  })
  it('observer exceptions cannot turn a committed answer into failure', async () => {
    const unsubscribe = subscribeReviewChanges(() => { throw new Error('observer') })
    expect((await submitReview(client(), intent())).ok).toBe(true)
    unsubscribe()
  })
})

describe('atomic Undo and late responses', () => {
  it('persists Undo before RPC and confirms the restored server revision', async () => {
    await submitReview(client(), intent())
    const sb = client(name => {
      expect(name).toBe('undo_grade_v2')
      expect(db.rows[0].status).toBe('undo_pending')
      return { data: { status: 'undone', card: card({ revision: 3, reps: 1 }) } }
    })
    expect(await undoReview(sb, 'u1', 'op1')).toMatchObject({ ok: true, status: 'undone', card: { revision: 3 } })
  })
  it('offline Undo does not claim success or permit grade retry to advance', async () => {
    await submitReview(client(), intent())
    const sb = client()
    expect(await undoReview(sb, 'u1', 'op1', { online: false })).toMatchObject({ ok: false, status: 'undo_pending' })
    expect(await submitReview(sb, intent(), { online: false })).toMatchObject({ ok: false, status: 'undo_pending' })
    expect(sb.rpc).not.toHaveBeenCalled()
  })
  it('a late duplicate grade ACK cannot overwrite a completed Undo', async () => {
    const wait = waitable()
    const slow = submitReview(client(() => wait.promise), intent())
    await Promise.resolve(); await Promise.resolve()
    await recoverReviews(client(), 'u1')
    await undoReview(client(() => ({ data: { status: 'undone', card: card({ revision: 3, reps: 1 }) } })), 'u1', 'op1')
    wait.resolve({ data: { status: 'applied', card: card() } })
    expect(await slow).toMatchObject({ ok: false, status: 'undone' })
    expect(db.rows[0].card.revision).toBe(3)
  })
  it('a stale Undo conflict leaves its UI rollback unconfirmed', async () => {
    await submitReview(client(), intent())
    expect(await undoReview(client(() => ({ error: { code: '40001' } })), 'u1', 'op1')).toMatchObject({ ok: false, status: 'conflict' })
  })
})

describe('scoped cache reconciliation', () => {
  it('overlays newer revision without changing another track or level', async () => {
    await submitReview(client(), intent())
    expect((await reconcileReviewCards('u1', [card({ revision: 1 })], track))[0].revision).toBe(2)
    expect(await reconcileReviewCards('u1', [], track, { level: 2 })).toEqual([])
    expect(await reconcileReviewCards('u1', [], { ...track, system: 'other' })).toEqual([])
  })
  it('keeps receipts after a fresh projection catches up so another stale cache still repairs', async () => {
    await submitReview(client(), intent())
    const baseline = await reviewBaseline('u1')
    await reconcileReviewCards('u1', [card()], track, {}, { fresh: true, baseline })
    expect((await reconcileReviewCards('u1', [card({ revision: 1 })], track))[0].revision).toBe(2)
  })
  it('authoritative absence retires only the pre-query receipt', async () => {
    await submitReview(client(), intent())
    const baseline = await reviewBaseline('u1')
    expect(await reconcileReviewCards('u1', [], track, {}, { fresh: true, baseline })).toEqual([])
    expect(db.rows[0].status).toBe('retired')
    expect(await reconcileReviewCards('u1', [card({ revision: 1 })], track)).toEqual([])
  })
  it('a query begun before an ACK cannot retire that newly settled review', async () => {
    const baseline = await reviewBaseline('u1')
    await submitReview(client(), intent())
    expect((await reconcileReviewCards('u1', [], track, {}, { fresh: true, baseline }))[0].revision).toBe(2)
  })
  it('retirement CAS cannot overwrite a receipt changed while the query ran', async () => {
    await submitReview(client(), intent())
    const baseline = await reviewBaseline('u1')
    await undoReview(client(() => ({ data: { status: 'undone', card: card({ revision: 3 }) } })), 'u1', 'op1')
    expect((await reconcileReviewCards('u1', [], track, {}, { fresh: true, baseline }))[0].revision).toBe(3)
  })
  it('retains distinct-identity tombstones through repeated reset and restudy', async () => {
    await submitReview(client(), intent())
    await reconcileReviewCards('u1', [], track, {}, { fresh: true, baseline: await reviewBaseline('u1') })
    await submitReview(client(() => ({ data: { status: 'applied', card: card({ id: 'c2', revision: 1 }) } })), intent({ opId: 'op2', cardId: null, expected: null, generation: 1 }))
    await reconcileReviewCards('u1', [], track, {}, { fresh: true, baseline: await reviewBaseline('u1') })
    await submitReview(client(() => ({ data: { status: 'applied', card: card({ id: 'c3', revision: 1 }) } })), intent({ opId: 'op3', cardId: null, expected: null, generation: 2 }))
    expect(db.rows.filter(row => row.status === 'retired')).toHaveLength(2)
    expect((await reconcileReviewCards('u1', [card({ id: 'c1', revision: 20 })], track))[0].id).toBe('c3')
    expect((await reconcileReviewCards('u1', [card({ id: 'c2', revision: 20 })], track))[0].id).toBe('c3')
  })
  it('blocks owned pending and legacy words without introducing synthetic scheduler state', async () => {
    await submitReview(client(), intent(), { online: false })
    db.legacy = [{ op: { kind: 'grade', userId: 'u1', vocabId: 'v2' } }, { op: { kind: 'grade', userId: 'u2', vocabId: 'v3' } }]
    expect(await pendingReviewVocabIds('u1')).toEqual(new Set(['v1', 'v2']))
    const cards = await reconcileReviewCards('u1', [card({ revision: 1 })], track)
    expect(cards[0]).toMatchObject({ revision: 1, review_pending: true })
  })
  it('counts pending introductions only once and excludes calibration claims', async () => {
    await submitReview(client(), intent({ state: 'new' }), { online: false })
    await submitReview(client(), intent({ opId: 'op2', vocabId: 'v2', state: 'new', priorKnown: true }), { online: false })
    expect(await pendingIntroductionCount('u1', '2026-09-28')).toBe(1)
    expect(await pendingIntroductionCount('u1', '2026-09-29')).toBe(0)
  })
})


it('scopes pending introductions and avoids counting an observed ACK twice', async () => {
  await submitReview(client(), intent({ state: 'new' }), { online: false })
  expect(await pendingIntroductionCount('u1', '2026-09-28', { ...track, system: 'other' })).toBe(0)
  expect(await pendingIntroductionCount('u1', '2026-09-28', track, [card()])).toBe(0)
  expect(await pendingIntroductionCount('u1', '2026-09-28', track, [card({ reps: 0 })])).toBe(1)
})


it('blocks a conflicted cached word until fresh server truth repairs every projection', async () => {
  await submitReview(client(), intent())
  const staleIntent = intent({ opId: 'op2', expected: card(), updates: { state: 'review', reps: 3 } })
  await submitReview(client(() => ({ error: { code: '40001' } })), staleIntent)
  expect(await pendingReviewVocabIds('u1')).toEqual(new Set(['v1']))
  expect(await submitReview(client(), { ...staleIntent, opId: 'op3' }, { online: false })).toMatchObject({ ok: false, status: 'conflict' })
  const baseline = await reviewBaseline('u1')
  const fresh = card({ revision: 3, reps: 3 })
  await reconcileReviewCards('u1', [fresh], track, {}, { fresh: true, baseline, complete: true })
  expect(await pendingReviewVocabIds('u1')).toEqual(new Set())
  expect((await reconcileReviewCards('u1', [card({ revision: 1 })], track))[0].revision).toBe(3)
  expect(await submitReview(client(), staleIntent, { online: false })).toMatchObject({ ok: false, status: 'conflict' })
})


it('partial projections cannot clear a conflict and create mixed scheduler state', async () => {
  await submitReview(client(() => ({ error: { code: '40001' } })), intent())
  const baseline = await reviewBaseline('u1')
  await reconcileReviewCards('u1', [card({ revision: 3 })], track, {}, { fresh: true, baseline, complete: false })
  expect(await pendingReviewVocabIds('u1')).toEqual(new Set(['v1']))
  expect(await submitReview(client(), intent({ opId: 'another' }), { online: false })).toMatchObject({ ok: false, status: 'conflict' })
})

it('compaction keeps a resolved replacement receipt carrying the sole older identity tombstone', async () => {
  await submitReview(client(() => ({ error: { code: '40001' } })), intent())
  const replacement = card({ id: 'c2', revision: 1, reps: 1 })
  await reconcileReviewCards('u1', [replacement], track, {}, { fresh: true, baseline: await reviewBaseline('u1'), complete: true })
  await submitReview(client(() => ({ data: { status: 'applied', card: { ...replacement, revision: 2, reps: 2 } } })), intent({ opId: 'new', cardId: 'c2', expected: replacement }))
  expect(db.rows.find(row => row.opId === 'op1').retiredCardId).toBe('c1')
  expect((await reconcileReviewCards('u1', [card({ revision: 99 })], track))[0]).toMatchObject({ id: 'c2', revision: 2 })
})


it('retains every old identity when a conflict replacement is itself reset again', async () => {
  await submitReview(client(() => ({ error: { code: '40001' } })), intent())
  await reconcileReviewCards('u1', [card({ id: 'c2', revision: 1 })], track, {}, { fresh: true, baseline: await reviewBaseline('u1'), complete: true })
  await reconcileReviewCards('u1', [], track, {}, { fresh: true, baseline: await reviewBaseline('u1'), complete: true })
  await submitReview(client(() => ({ data: { status: 'applied', card: card({ id: 'c3', revision: 1 }) } })), intent({ opId: 'third', cardId: null, expected: null }))
  expect(db.rows[0].retiredCardIds).toEqual(['c1', 'c2'])
  expect((await reconcileReviewCards('u1', [card({ id: 'c1', revision: 99 })], track))[0].id).toBe('c3')
  expect((await reconcileReviewCards('u1', [card({ id: 'c2', revision: 99 })], track))[0].id).toBe('c3')
})
