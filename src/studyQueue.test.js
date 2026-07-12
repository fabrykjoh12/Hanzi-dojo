import { describe, it, expect } from 'vitest'
import {
  buildStudyQueue, reinsertSoon, makeRng, seededShuffle, hashSeed, queueSeed,
} from './studyQueue'

// Card factories tagged by state so the ordering invariants can be checked.
const learn = (i) => ({ id: 'L' + i, vocab_id: 'lv' + i, state: 'learning' })
const relearn = (i) => ({ id: 'X' + i, vocab_id: 'xv' + i, state: 'relearning' })
const review = (i) => ({ id: 'R' + i, vocab_id: 'rv' + i, state: 'review' })
const fresh = (i) => ({ id: null, vocab_id: 'nv' + i, state: 'new' })

const many = (fn, n) => Array.from({ length: n }, (_, i) => fn(i))

const isNew = (c) => c.state === 'new'
const ids = (cards) => cards.map(c => c.vocab_id).sort()

// Longest run of consecutive new cards found before the last review/learning
// card (i.e. while a breaker was still available).
function maxNewRunWhileReviewsRemain(queue) {
  let lastNonNew = -1
  queue.forEach((c, i) => { if (!isNew(c)) lastNonNew = i })
  let run = 0, max = 0
  for (let i = 0; i <= lastNonNew; i += 1) {
    if (isNew(queue[i])) { run += 1; max = Math.max(max, run) } else run = 0
  }
  return max
}

describe('makeRng / seededShuffle', () => {
  it('same seed → same sequence', () => {
    const a = makeRng(42); const b = makeRng(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
  it('string and numeric seeds both work and hash is stable', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'))
    const r = makeRng('hello')
    expect(r()).toBeGreaterThanOrEqual(0)
    expect(r()).toBeLessThan(1)
  })
  it('seededShuffle is a permutation (no loss/dupes)', () => {
    const items = many(review, 20)
    expect(ids(seededShuffle(items, makeRng(1)))).toEqual(ids(items))
  })
})

describe('buildStudyQueue — completeness', () => {
  it('contains exactly all input cards, no dupes, no missing', () => {
    const dueLearning = many(learn, 3)
    const dueReview = many(review, 10)
    const newItems = many(fresh, 8)
    const q = buildStudyQueue({ dueLearning, dueReview, newItems, seed: 7 })
    expect(q.length).toBe(21)
    expect(ids(q)).toEqual(ids([...dueLearning, ...dueReview, ...newItems]))
  })
})

describe('buildStudyQueue — ordering rules', () => {
  it('starts with a learning card when learning cards exist (priority early)', () => {
    const q = buildStudyQueue({
      dueLearning: many(learn, 2), dueReview: many(review, 6), newItems: many(fresh, 6), seed: 3,
    })
    expect(q[0].state).toBe('learning')
    // Both learning cards land in the first third — clearly front-loaded.
    const learnIdx = q.map((c, i) => (c.state === 'learning' ? i : -1)).filter(i => i >= 0)
    expect(Math.max(...learnIdx)).toBeLessThan(Math.ceil(q.length / 2))
  })

  it('never starts with a new card when reviews or learning exist', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const q = buildStudyQueue({ dueReview: many(review, 6), newItems: many(fresh, 6), seed })
      expect(isNew(q[0])).toBe(false)
    }
  })

  it('reviews (and learning) generally appear before new cards', () => {
    const q = buildStudyQueue({ dueReview: many(review, 10), newItems: many(fresh, 10), seed: 11 })
    const firstNew = q.findIndex(isNew)
    const firstReview = q.findIndex(c => c.state === 'review')
    expect(firstReview).toBeLessThan(firstNew)
  })

  it('never places 3 new cards back-to-back while a review remains', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const q = buildStudyQueue({ dueReview: many(review, 12), newItems: many(fresh, 10), seed })
      expect(maxNewRunWhileReviewsRemain(q)).toBeLessThanOrEqual(2)
    }
  })

  it('distributes new cards through the session (not clustered at one end)', () => {
    const q = buildStudyQueue({ dueReview: many(review, 12), newItems: many(fresh, 12), seed: 5 })
    const newIdx = q.map((c, i) => (isNew(c) ? i : -1)).filter(i => i >= 0)
    const half = q.length / 2
    // At least one new card in each half → genuinely spread, not dumped.
    expect(Math.min(...newIdx)).toBeLessThan(half)
    expect(Math.max(...newIdx)).toBeGreaterThanOrEqual(half)
  })

  it('is not a perfectly alternating review→new→review→new pattern', () => {
    const q = buildStudyQueue({ dueReview: many(review, 10), newItems: many(fresh, 10), seed: 9 })
    let alternating = true
    for (let i = 1; i < q.length; i += 1) {
      if (isNew(q[i]) === isNew(q[i - 1])) { alternating = false; break }
    }
    expect(alternating).toBe(false)
  })
})

describe('buildStudyQueue — determinism', () => {
  it('same seed + same inputs → identical queue', () => {
    const input = { dueLearning: many(learn, 2), dueReview: many(review, 8), newItems: many(fresh, 6) }
    const a = buildStudyQueue({ ...input, seed: 123 })
    const b = buildStudyQueue({ ...input, seed: 123 })
    expect(a.map(c => c.vocab_id)).toEqual(b.map(c => c.vocab_id))
  })

  it('different seeds → different (but still valid) orders', () => {
    const input = { dueReview: many(review, 10), newItems: many(fresh, 8) }
    const a = buildStudyQueue({ ...input, seed: 1 })
    const b = buildStudyQueue({ ...input, seed: 999 })
    expect(a.map(c => c.vocab_id)).not.toEqual(b.map(c => c.vocab_id))
    // Both remain complete + valid.
    expect(ids(a)).toEqual(ids(b))
    expect(isNew(a[0])).toBe(false)
    expect(isNew(b[0])).toBe(false)
  })

  it('queueSeed varies by day but is stable for the same context', () => {
    const ctx = { userId: 'u1', language: 'chinese', system: 'hsk_3', level: 1 }
    expect(queueSeed({ ...ctx, day: '2026-07-12' })).toBe(queueSeed({ ...ctx, day: '2026-07-12' }))
    expect(queueSeed({ ...ctx, day: '2026-07-12' })).not.toBe(queueSeed({ ...ctx, day: '2026-07-13' }))
  })
})

describe('buildStudyQueue — single-pool and tiny inputs', () => {
  it('works with only new cards', () => {
    const newItems = many(fresh, 5)
    const q = buildStudyQueue({ newItems, seed: 2 })
    expect(ids(q)).toEqual(ids(newItems))
    // New cards keep curriculum order when nothing else is present.
    expect(q.map(c => c.vocab_id)).toEqual(newItems.map(c => c.vocab_id))
  })
  it('works with only review cards', () => {
    const dueReview = many(review, 5)
    const q = buildStudyQueue({ dueReview, seed: 2 })
    expect(ids(q)).toEqual(ids(dueReview))
  })
  it('works with only learning cards (incl. relearning)', () => {
    const dueLearning = [...many(learn, 3), ...many(relearn, 2)]
    const q = buildStudyQueue({ dueLearning, seed: 2 })
    expect(ids(q)).toEqual(ids(dueLearning))
    expect(q[0].state === 'learning' || q[0].state === 'relearning').toBe(true)
  })
  it('handles empty input and singletons', () => {
    expect(buildStudyQueue({})).toEqual([])
    expect(buildStudyQueue({ dueReview: [review(0)] }).length).toBe(1)
    expect(buildStudyQueue({ newItems: [fresh(0)] }).length).toBe(1)
  })
})

describe('reinsertSoon (after grading Again)', () => {
  it('does not place the failed card immediately next when the queue is long enough', () => {
    const rest = many(review, 6)
    const again = learn(99)
    const out = reinsertSoon(rest, again, 2)
    expect(out[0].vocab_id).not.toBe(again.vocab_id)   // not the very next card
    expect(out.indexOf(again)).toBeGreaterThanOrEqual(2)
    expect(out.length).toBe(rest.length + 1)
  })

  it('inserts at the SRS-suggested gap, clamped to queue length', () => {
    const rest = many(review, 10)
    const again = learn(99)
    expect(reinsertSoon(rest, again, 5).indexOf(again)).toBe(5)
    expect(reinsertSoon(rest, again, 100).indexOf(again)).toBe(10)  // clamped to end
  })

  it('falls back to immediate only when the queue is too short (unavoidable)', () => {
    expect(reinsertSoon([], { vocab_id: 'x' }, 2)).toEqual([{ vocab_id: 'x' }])
    const one = [review(0)]
    // One card left: the Again card goes after it, still not before it.
    expect(reinsertSoon(one, learn(9), 2).map(c => c.vocab_id)).toEqual(['rv0', 'lv9'])
  })
})
