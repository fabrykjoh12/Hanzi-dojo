# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: review-journal.spec.js >> known conflicts prevent offline acceptance until authoritative refresh
- Location: tests/e2e/review-journal.spec.js:82:1

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 2
+ Received  + 2

  Object {
    "blocked": false,
-   "fresh": true,
-   "repaired": 3,
+   "fresh": false,
+   "repaired": 2,
    "stillStale": false,
  }
```

# Page snapshot

```yaml
- generic [ref=e4]:
  - generic [ref=e5]:
    - generic [ref=e6]:
      - img "Hanzi Dojo logo" [ref=e7]
      - generic [ref=e8]: Hanzi Dojo
    - button "Log in" [ref=e9] [cursor=pointer]
  - generic [ref=e10]:
    - generic [ref=e11]: Reading-first Chinese
    - heading "Learn words. Unlock stories you can actually read." [level=1] [ref=e12]
    - paragraph [ref=e13]: "Read real Chinese in your first minute. No streaks. No leagues. No guilt — just real progress: Hanzi Dojo pairs a proven memory engine with graded stories matched to the words you know."
    - button "Start your first story" [ref=e15] [cursor=pointer]:
      - text: Start your first story
      - img [ref=e16]
    - link "Or find out how much Chinese you can already read — free 3-minute test →" [ref=e19] [cursor=pointer]:
      - /url: /how-much-can-you-read
    - generic [ref=e20]: Start free. No credit card. Learn your first words and unlock your first story in minutes.
  - generic [ref=e21]:
    - generic [ref=e22]:
      - generic [ref=e23]:
        - img [ref=e24]
        - text: Review · due now
      - generic [ref=e27]: 朋友
      - generic [ref=e28]: péngyou
      - generic [ref=e29]: friend
      - generic [ref=e30]:
        - generic [ref=e31]: Again
        - generic [ref=e32]: Hard
        - generic [ref=e33]: Good
        - generic [ref=e34]: Easy
      - generic [ref=e35]: Example review card · your intervals adapt to your answers
    - generic [ref=e36]:
      - generic [ref=e37]:
        - generic [ref=e38]: In the Park
        - generic [ref=e39]: Example · 5 of 7 words known
      - generic [ref=e44]: 今天我和朋友去公园散步。
      - generic [ref=e45]: Tap an underlined word to see it — one more tap adds it to your deck.
  - generic [ref=e46]:
    - heading "No shortcuts — that's the point." [level=2] [ref=e47]
    - paragraph [ref=e48]: Remember useful words, then meet them again in context.
  - generic [ref=e49]:
    - generic [ref=e50]:
      - img [ref=e52]
      - generic [ref=e56]: Real spaced repetition
      - generic [ref=e57]: FSRS estimates when each word needs another review. Your answers adjust its schedule as you learn.
    - generic [ref=e58]:
      - img [ref=e60]
      - generic [ref=e62]: Stories you can read
      - generic [ref=e63]: Every story shows how much of it you already know. New words are underlined; one tap shows the meaning, one more adds it to your deck. Comprehensible input without the hunting.
    - generic [ref=e64]:
      - img [ref=e66]
      - generic [ref=e69]: Honest progression
      - generic [ref=e70]: A level test checks your recall before you move on. Progress reflects your reviews and test answers.
  - generic [ref=e71]:
    - generic [ref=e72]: Your daily loop — about 15 focused minutes
    - generic [ref=e73]:
      - generic [ref=e74]:
        - generic [ref=e75]:
          - img [ref=e77]
          - generic [ref=e81]: Flashcards
        - img [ref=e82]
      - generic [ref=e84]:
        - generic [ref=e85]:
          - img [ref=e87]
          - generic [ref=e89]: Stories
        - img [ref=e90]
      - generic [ref=e92]:
        - generic [ref=e93]:
          - img [ref=e95]
          - generic [ref=e97]: Videos
        - img [ref=e98]
      - generic [ref=e101]:
        - img [ref=e103]
        - generic [ref=e105]: Writing
  - generic [ref=e106]:
    - heading "Fifteen minutes a day. Real reading you can feel." [level=2] [ref=e107]
    - button "Build my reading path" [ref=e108] [cursor=pointer]:
      - text: Build my reading path
      - img [ref=e109]
    - generic [ref=e111]: Start free · Core learning is free · No credit card required
  - generic [ref=e112]:
    - generic [ref=e113]: Hanzi Dojo is community-driven. Join learners shaping what we build next.
    - link "Join our Discord" [ref=e114] [cursor=pointer]:
      - /url: https://discord.gg/GhWDpgZY9N
      - img [ref=e115]
      - text: Join our Discord
    - generic [ref=e118]:
      - link "How it teaches" [ref=e119] [cursor=pointer]:
        - /url: /methodology
      - link "Privacy" [ref=e120] [cursor=pointer]:
        - /url: /privacy
      - link "Terms" [ref=e121] [cursor=pointer]:
        - /url: /terms
      - link "Support" [ref=e122] [cursor=pointer]:
        - /url: /support
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test'
  2   |
  3   | // Real browser IndexedDB, not an in-memory mock. Direct module imports keep
  4   | // these storage protocol checks independent from signed-in fixture UI state.
  5   | test('review transactions commit, reject concurrent words, and preserve Undo CAS', async ({ page }) => {
  6   |   await page.goto('/')
  7   |   const result = await page.evaluate(async () => {
  8   |     const storage = await import('/src/offline.js')
  9   |     await storage.reviewClear('idb-user')
  10  |     const intent = { opId: 'idb-op1', userId: 'idb-user', vocabId: 'v1', cardId: 'c1', expected: { revision: 1 }, updates: { reps: 2 } }
  11  |     const first = await storage.reviewCreate(intent)
  12  |     const [duplicate, competing] = await Promise.allSettled([
  13  |       storage.reviewCreate({ ...intent, updates: { reps: 99 } }),
  14  |       storage.reviewCreate({ ...intent, opId: 'idb-op2' }),
  15  |     ])
  16  |     const applied = await storage.reviewUpdate(first.opId, first.userId, { status: 'applied', card: { id: 'c1', revision: 2 } }, first)
  17  |     const undo = await storage.reviewUpdate(first.opId, first.userId, { status: 'undo_pending' }, applied)
  18  |     const late = await storage.reviewUpdate(first.opId, first.userId, { status: 'applied', card: { id: 'c1', revision: 2 } }, first)
  19  |     await storage.reviewDeleteMany([applied], first.userId)
  20  |     await storage.clearDownloads()
  21  |     const kept = await storage.reviewRecords(first.userId)
  22  |     return { duplicate: duplicate.value?.intent.updates.reps, competing: competing.status, undo: undo.status, late: late.status, kept: kept.length, foreign: (await storage.reviewRecords('other-user')).length }
  23  |   })
  24  |   expect(result).toEqual({ duplicate: 2, competing: 'rejected', undo: 'undo_pending', late: 'undo_pending', kept: 1, foreign: 0 })
  25  | })
  26  |
  27  | test('retirement and compaction recheck row versions within the transaction', async ({ page }) => {
  28  |   await page.goto('/')
  29  |   const result = await page.evaluate(async () => {
  30  |     const storage = await import('/src/offline.js')
  31  |     await storage.reviewClear('idb-user')
  32  |     const intent = { opId: 'idb-retire', userId: 'idb-user', vocabId: 'v1', cardId: 'c1', expected: { revision: 1 } }
  33  |     const pending = await storage.reviewCreate(intent)
  34  |     const applied = await storage.reviewUpdate(pending.opId, pending.userId, { status: 'applied', card: { id: 'c1', revision: 2 } }, pending)
  35  |     const retired = await storage.reviewUpdate(applied.opId, applied.userId, { status: 'retired', retiredCardId: 'c1', card: null }, applied)
  36  |     await storage.reviewDeleteMany([applied, retired], intent.userId)
  37  |     const stale = await storage.reviewUpdate(pending.opId, pending.userId, { status: 'applied', card: { id: 'c1', revision: 2 } }, applied)
  38  |     let staleCreate
  39  |     try { await storage.reviewCreate({ ...intent, opId: 'idb-stale-new' }); staleCreate = 'accepted' }
  40  |     catch { staleCreate = 'rejected' }
  41  |     const next = await storage.reviewCreate({ ...intent, opId: 'idb-fresh', cardId: null, expected: null })
  42  |     return { count: (await storage.reviewRecords(intent.userId)).length, stale: stale.status, staleCreate, monotonic: next.ordinal > retired.ordinal }
  43  |   })
  44  |   expect(result).toEqual({ count: 2, stale: 'retired', staleCreate: 'rejected', monotonic: true })
  45  | })
  46  |
  47  |
  48  | test('deleting one account preserves another account’s pending reviews and outbox', async ({ page }) => {
  49  |   await page.goto('/')
  50  |   const result = await page.evaluate(async () => {
  51  |     const storage = await import('/src/offline.js')
  52  |     const deletion = await import('/src/accountDeletion.js')
  53  |     await storage.reviewCreate({ opId: 'owner-a-op', userId: 'owner-a', vocabId: 'v1' })
  54  |     await storage.reviewCreate({ opId: 'owner-b-op', userId: 'owner-b', vocabId: 'v1' })
  55  |     await storage.outboxAdd({ kind: 'grade', userId: 'owner-a', vocabId: 'v2' })
  56  |     await storage.outboxAdd({ kind: 'grade', userId: 'owner-b', vocabId: 'v2' })
  57  |     await deletion.forgetDeviceData('owner-b')
  58  |     return { a: (await storage.reviewRecords('owner-a')).length, b: (await storage.reviewRecords('owner-b')).length,
  59  |       outboxOwners: (await storage.outboxAll()).map(row => row.op.userId) }
  60  |   })
  61  |   expect(result).toEqual({ a: 1, b: 0, outboxOwners: ['owner-a'] })
  62  | })
  63  |
  64  |
  65  | test('an offline tab cannot accept a stale absent or replaced card once a newer receipt is known', async ({ page }) => {
  66  |   await page.goto('/')
  67  |   const result = await page.evaluate(async () => {
  68  |     const storage = await import('/src/offline.js')
  69  |     const journal = await import('/src/reviewJournal.js')
  70  |     const original = { opId: 'race-first', userId: 'race-owner', vocabId: 'v1', cardId: null, expected: null }
  71  |     const created = await storage.reviewCreate(original)
  72  |     await storage.reviewUpdate(created.opId, created.userId, { status: 'applied', card: { id: 'server-card', revision: 1 } }, created)
  73  |     const client = { rpc() { throw new Error('Offline must never send') } }
  74  |     const absent = await journal.submitReview(client, { ...original, opId: 'stale-absence' }, { online: false })
  75  |     const replacement = await journal.submitReview(client, { ...original, opId: 'stale-replacement', cardId: 'old-card', expected: { id: 'old-card', revision: 99 } }, { online: false })
  76  |     return { absent: { ok: absent.ok, status: absent.status }, replacement: { ok: replacement.ok, status: replacement.status }, rows: (await storage.reviewRecords('race-owner')).length }
  77  |   })
  78  |   expect(result).toEqual({ absent: { ok: false, status: 'conflict' }, replacement: { ok: false, status: 'conflict' }, rows: 1 })
  79  | })
  80  |
  81  |
  82  | test('known conflicts prevent offline acceptance until authoritative refresh', async ({ page }) => {
  83  |   await page.goto('/')
  84  |   const result = await page.evaluate(async () => {
  85  |     const storage = await import('/src/offline.js')
  86  |     const journal = await import('/src/reviewJournal.js')
  87  |     const track = { language: 'chinese', system: 'hsk_3' }
  88  |     const first = { ...track, level: 1, opId: 'conflict-first', userId: 'conflict-owner', vocabId: 'v1', cardId: 'c1', expected: { revision: 1 } }
  89  |     const base = await storage.reviewCreate(first)
  90  |     await storage.reviewUpdate(base.opId, base.userId, { status: 'applied', card: { id: 'c1', vocab_id: 'v1', revision: 2 } }, base)
  91  |     const stale = { ...first, opId: 'conflict-second', expected: { id: 'c1', revision: 2 } }
  92  |     await journal.submitReview({ rpc: async () => ({ error: { code: '40001' } }) }, stale)
  93  |     const client = { rpc() { throw new Error('Offline') } }
  94  |     const blocked = await journal.submitReview(client, { ...stale, opId: 'conflict-third' }, { online: false })
  95  |     await journal.reconcileReviewCards(first.userId, [{ id: 'c1', vocab_id: 'v1', revision: 3 }], track, {}, { fresh: true, baseline: await journal.reviewBaseline(first.userId), complete: true })
  96  |     const repaired = await journal.reconcileReviewCards(first.userId, [{ id: 'c1', vocab_id: 'v1', revision: 1 }], track)
  97  |     const stillStale = await journal.submitReview(client, { ...stale, opId: 'conflict-fourth' }, { online: false })
  98  |     const fresh = await journal.submitReview(client, { ...stale, opId: 'conflict-fifth', expected: { id: 'c1', revision: 3 } }, { online: false })
  99  |     return { blocked: blocked.ok, repaired: repaired[0].revision, stillStale: stillStale.ok, fresh: fresh.ok }
  100 |   })
> 101 |   expect(result).toEqual({ blocked: false, repaired: 3, stillStale: false, fresh: true })
      |                  ^ Error: expect(received).toEqual(expected) // deep equality
  102 | })
  103 |
```