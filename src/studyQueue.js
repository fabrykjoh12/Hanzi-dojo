// Study session queue construction — pure, deterministic, and testable.
//
// The FSRS scheduler (srs.js) decides WHEN a card is due and its next interval.
// This module decides only the ORDER cards are shown within one session, so the
// session feels like an intelligent review rather than a fixed script:
//
//   - Learning/relearning cards lead (time-sensitive re-tries).
//   - Due reviews are the backbone.
//   - New cards are woven throughout, never dumped in a block.
//   - Never more than 2 new cards in a row while a review/learning card is
//     still available to break them up.
//
// Randomness is seeded (mulberry32) so the same inputs + seed always yield the
// same queue — reproducible in tests and stable across a reload within a day —
// while different seeds (e.g. different days) produce different valid orders.

// Relative likelihood of drawing from each pool while several are non-empty.
// Learning highest (clear the time-sensitive cards early), review the backbone,
// new lower but recurring so they spread across the whole session.
const WEIGHT_LEARNING = 5
const WEIGHT_REVIEW = 3
const WEIGHT_NEW = 2

// Never show a 3rd consecutive new card while a review/learning card remains.
const MAX_CONSECUTIVE_NEW = 2

// FNV-1a string hash → 32-bit unsigned. Turns a seed string (user/level/day)
// into a numeric seed for the PRNG.
export function hashSeed(str) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// mulberry32 — a tiny, fast, well-distributed seeded PRNG. Returns a function
// producing floats in [0, 1). Accepts a numeric or string seed.
export function makeRng(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : hashSeed(String(seed || ''))
  return function next() {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Deterministic Fisher–Yates shuffle driven by a seeded rng (returns a copy).
export function seededShuffle(items, rng) {
  const a = items.slice()
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const t = a[i]; a[i] = a[j]; a[j] = t
  }
  return a
}

// Build a stable seed string from session context. `day` is passed in (not read
// from the clock) so the function stays pure and testable; the caller supplies
// today's date so the order is stable within a day and varies day to day.
export function queueSeed({ userId = '', language = '', system = '', level = '', day = '' } = {}) {
  return [userId, language, system, level, day].join('|')
}

function weightedPick(rng, candidates) {
  const total = candidates.reduce((sum, c) => sum + c.weight, 0)
  let r = rng() * total
  for (const c of candidates) {
    r -= c.weight
    if (r < 0) return c.key
  }
  return candidates[candidates.length - 1].key
}

// buildStudyQueue({ dueLearning, dueReview, newItems, seed }) → ordered array.
//
// Contract:
//   - Output contains exactly the input cards (no missing, no duplicates).
//   - Learning/relearning cards are shuffled and lead the session; the first
//     card is a learning card if any exist, else a due review, else a new card.
//   - Due reviews are shuffled (their mutual order carries no SRS priority).
//   - New cards keep their given order (curriculum sort_order) — only their
//     placement is randomized, so easier words still tend to come first.
//   - No 3rd consecutive new card while a review/learning card is available.
export function buildStudyQueue({ dueLearning = [], dueReview = [], newItems = [], seed = 0 } = {}) {
  const rng = makeRng(seed)
  const L = seededShuffle(dueLearning, rng)
  const R = seededShuffle(dueReview, rng)
  const N = newItems.slice()   // preserve curriculum order

  const out = []
  let consecutiveNew = 0

  while (L.length || R.length || N.length) {
    const reviewishAvailable = L.length > 0 || R.length > 0

    // The opening card is deterministic: learning → review → new. This keeps
    // the session from ever starting on a new card when real reviews wait.
    if (out.length === 0) {
      if (L.length) { out.push(L.shift()); consecutiveNew = 0; continue }
      if (R.length) { out.push(R.shift()); consecutiveNew = 0; continue }
      out.push(N.shift()); consecutiveNew = 1; continue
    }

    const candidates = []
    if (L.length) candidates.push({ key: 'L', weight: WEIGHT_LEARNING })
    if (R.length) candidates.push({ key: 'R', weight: WEIGHT_REVIEW })
    // New is eligible unless capping consecutive-new would be violated while a
    // review/learning card is still on hand to break the run.
    const newBlocked = reviewishAvailable && consecutiveNew >= MAX_CONSECUTIVE_NEW
    if (N.length && !newBlocked) candidates.push({ key: 'N', weight: WEIGHT_NEW })

    // Fallback (shouldn't happen — if a pool is non-empty a candidate exists,
    // since `newBlocked` only triggers when review/learning is available).
    const key = candidates.length
      ? weightedPick(rng, candidates)
      : (L.length ? 'L' : R.length ? 'R' : 'N')

    if (key === 'L') { out.push(L.shift()); consecutiveNew = 0 }
    else if (key === 'R') { out.push(R.shift()); consecutiveNew = 0 }
    else { out.push(N.shift()); consecutiveNew += 1 }
  }

  return out
}

// Reinsert a card graded "Again" that must stay in the session. `gap` is the
// SRS-suggested distance (srs.schedule returns >= 2). Insert it soon but not
// immediately next unless the remaining queue is too short to allow it — a
// misremembered word shouldn't reappear as the very next card unless there's
// nothing else to show. Pure: returns a new array.
export function reinsertSoon(rest, card, gap = 2) {
  const pos = Math.min(Math.max(2, gap), rest.length)
  const out = rest.slice()
  out.splice(pos, 0, card)
  return out
}
