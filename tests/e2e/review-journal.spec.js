import { authedTest } from '../fixtures/mockSupabase.js'
import { StudyPage } from '../pages/StudyPage.js'
import { test, expect } from '@playwright/test'

// Real browser IndexedDB, not an in-memory mock. Direct module imports keep
// these storage protocol checks independent from signed-in fixture UI state.
test('review transactions commit, reject concurrent words, and preserve Undo CAS', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const storage = await import('/src/offline.js')
    await storage.reviewClear('idb-user')
    const intent = { opId: 'idb-op1', userId: 'idb-user', vocabId: 'v1', cardId: 'c1', expected: { revision: 1 }, updates: { reps: 2 } }
    const first = await storage.reviewCreate(intent)
    const [duplicate, competing] = await Promise.allSettled([
      storage.reviewCreate({ ...intent, updates: { reps: 99 } }),
      storage.reviewCreate({ ...intent, opId: 'idb-op2' }),
    ])
    const applied = await storage.reviewUpdate(first.opId, first.userId, { status: 'applied', card: { id: 'c1', revision: 2 } }, first)
    const undo = await storage.reviewUpdate(first.opId, first.userId, { status: 'undo_pending' }, applied)
    const late = await storage.reviewUpdate(first.opId, first.userId, { status: 'applied', card: { id: 'c1', revision: 2 } }, first)
    await storage.reviewDeleteMany([applied], first.userId)
    await storage.clearDownloads()
    const kept = await storage.reviewRecords(first.userId)
    return { duplicate: duplicate.value?.intent.updates.reps, competing: competing.status, undo: undo.status, late: late.status, kept: kept.length, foreign: (await storage.reviewRecords('other-user')).length }
  })
  expect(result).toEqual({ duplicate: 2, competing: 'rejected', undo: 'undo_pending', late: 'undo_pending', kept: 1, foreign: 0 })
})

test('retirement and compaction recheck row versions within the transaction', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const storage = await import('/src/offline.js')
    await storage.reviewClear('idb-user')
    const intent = { opId: 'idb-retire', userId: 'idb-user', vocabId: 'v1', cardId: 'c1', expected: { revision: 1 } }
    const pending = await storage.reviewCreate(intent)
    const applied = await storage.reviewUpdate(pending.opId, pending.userId, { status: 'applied', card: { id: 'c1', revision: 2 } }, pending)
    const retired = await storage.reviewUpdate(applied.opId, applied.userId, { status: 'retired', retiredCardId: 'c1', card: null }, applied)
    await storage.reviewDeleteMany([applied, retired], intent.userId)
    const stale = await storage.reviewUpdate(pending.opId, pending.userId, { status: 'applied', card: { id: 'c1', revision: 2 } }, applied)
    let staleCreate
    try { await storage.reviewCreate({ ...intent, opId: 'idb-stale-new' }); staleCreate = 'accepted' }
    catch { staleCreate = 'rejected' }
    const next = await storage.reviewCreate({ ...intent, opId: 'idb-fresh', cardId: null, expected: null })
    return { count: (await storage.reviewRecords(intent.userId)).length, stale: stale.status, staleCreate, monotonic: next.ordinal > retired.ordinal }
  })
  expect(result).toEqual({ count: 2, stale: 'retired', staleCreate: 'rejected', monotonic: true })
})


test('deleting one account preserves another account’s pending reviews and outbox', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const storage = await import('/src/offline.js')
    const deletion = await import('/src/accountDeletion.js')
    await storage.reviewCreate({ opId: 'owner-a-op', userId: 'owner-a', vocabId: 'v1' })
    await storage.reviewCreate({ opId: 'owner-b-op', userId: 'owner-b', vocabId: 'v1' })
    await storage.outboxAdd({ kind: 'grade', userId: 'owner-a', vocabId: 'v2' })
    await storage.outboxAdd({ kind: 'grade', userId: 'owner-b', vocabId: 'v2' })
    await deletion.forgetDeviceData('owner-b')
    return { a: (await storage.reviewRecords('owner-a')).length, b: (await storage.reviewRecords('owner-b')).length,
      outboxOwners: (await storage.outboxAll()).map(row => row.op.userId) }
  })
  expect(result).toEqual({ a: 1, b: 0, outboxOwners: ['owner-a'] })
})


test('an offline tab cannot accept a stale absent or replaced card once a newer receipt is known', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const storage = await import('/src/offline.js')
    const journal = await import('/src/reviewJournal.js')
    const original = { opId: 'race-first', userId: 'race-owner', vocabId: 'v1', cardId: null, expected: null }
    const created = await storage.reviewCreate(original)
    await storage.reviewUpdate(created.opId, created.userId, { status: 'applied', card: { id: 'server-card', revision: 1 } }, created)
    const client = { rpc() { throw new Error('Offline must never send') } }
    const absent = await journal.submitReview(client, { ...original, opId: 'stale-absence' }, { online: false })
    const replacement = await journal.submitReview(client, { ...original, opId: 'stale-replacement', cardId: 'old-card', expected: { id: 'old-card', revision: 99 } }, { online: false })
    return { absent: { ok: absent.ok, status: absent.status }, replacement: { ok: replacement.ok, status: replacement.status }, rows: (await storage.reviewRecords('race-owner')).length }
  })
  expect(result).toEqual({ absent: { ok: false, status: 'conflict' }, replacement: { ok: false, status: 'conflict' }, rows: 1 })
})


test('known conflicts prevent offline acceptance until authoritative refresh', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const storage = await import('/src/offline.js')
    const journal = await import('/src/reviewJournal.js')
    const track = { language: 'chinese', system: 'hsk_3' }
    const first = { ...track, level: 1, opId: 'conflict-first', userId: 'conflict-owner', vocabId: 'v1', cardId: 'c1', expected: { revision: 1 } }
    const base = await storage.reviewCreate(first)
    await storage.reviewUpdate(base.opId, base.userId, { status: 'applied', card: { id: 'c1', vocab_id: 'v1', revision: 2 } }, base)
    const stale = { ...first, opId: 'conflict-second', expected: { id: 'c1', revision: 2 } }
    await journal.submitReview({ rpc: async () => ({ error: { code: '40001' } }) }, stale)
    const client = { rpc() { throw new Error('Offline') } }
    const blocked = await journal.submitReview(client, { ...stale, opId: 'conflict-third' }, { online: false })
    await journal.reconcileReviewCards(first.userId, [{ id: 'c1', vocab_id: 'v1', revision: 3 }], track, {}, { fresh: true, baseline: await journal.reviewBaseline(first.userId), complete: true })
    const repaired = await journal.reconcileReviewCards(first.userId, [{ id: 'c1', vocab_id: 'v1', revision: 1 }], track)
    const stillStale = await journal.submitReview(client, { ...stale, opId: 'conflict-fourth' }, { online: false })
    const fresh = await journal.submitReview(client, { ...stale, opId: 'conflict-fifth', expected: { id: 'c1', revision: 3 } }, { online: false })
    return { blocked: blocked.ok, repaired: repaired[0].revision, stillStale: stillStale.ok, fresh: fresh.ok }
  })
  expect(result).toEqual({ blocked: false, repaired: 3, stillStale: false, fresh: true })
})


authedTest('an uncertain next grade cannot reuse the previous Undo queue snapshot', async ({ page }) => {
  const study = new StudyPage(page)
  await study.goto()
  await study.reveal()
  await study.gradeGood.click()
  const undo = page.getByRole('button', { name: 'Undo last grade' })
  await expect(undo).toBeEnabled()
  await page.route('**/rest/v1/rpc/grade_card_v2', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'connection interrupted' }) }))
  await study.reveal()
  await study.gradeGood.click()
  await expect(page.getByText('Review needs attention')).toBeVisible()
  await expect(undo).toBeDisabled()
})
