import { describe, it, expect } from 'vitest'

// The guard against the failure this whole phase exists to fix.
//
// Before knowledgeState.js the app had four different answers to "does the
// learner know this word?" — mastery.isLearned, storyReading.wordStatus,
// dictionaryFilters.cardStatus and knownWordMap.wordStatus — and they agreed
// only because the old prior-knowledge seed lit up every signal at once. This
// file runs ONE fixture deck through every consumer simultaneously. If any of
// them ever drifts back to reading raw columns, exactly one assertion here
// fails and names the consumer.

import { priorKnownCardRow, isPriorKnown, isMastered, isLearned, countsForReading, countMastery, readingCoveragePct } from './knowledgeState'
import { wordStatus as readerStatus, calculateStoryReadability } from './storyReading'
import { wordStatus as mapStatus, knownWordMap } from './knownWordMap'
import { cardStatus } from './dictionaryFilters'
import { learnedByLevel } from './storyTiers'
import { resolveTestStatus } from './testLogic'
import { studyFloorLevel } from './levelScope'
import { dueReviewCards, dueLearningCards, weakCards } from './studyAvailability'
import { isCardDue } from './srs'

const NOW = Date.UTC(2026, 7, 22, 12, 0, 0)
const now = new Date(NOW)
const iso = (offsetDays = 0) => new Date(NOW + offsetDays * 86400000).toISOString()

// One learner, four words, one of each knowledge state.
const CLAIMED = priorKnownCardRow('u1', 'v-claim', 'placement', NOW)
const VERIFIED = {
  vocab_id: 'v-verified', state: 'review', reps: 2, lapses: 0,
  stability: 8.3, difficulty: 5, learned: true, is_easy: false,
  last_review: iso(-8), due_at: iso(0), prior_known_at: null, verified_at: null,
}
const MASTERED = {
  vocab_id: 'v-mastered', state: 'review', reps: 9, lapses: 0,
  stability: 40, difficulty: 4, learned: true, is_easy: false,
  last_review: iso(-30), due_at: iso(10), prior_known_at: null, verified_at: null,
}
const LEARNING = {
  vocab_id: 'v-learning', state: 'learning', reps: 1, lapses: 0,
  stability: 2.3, difficulty: 6, learned: false, is_easy: false,
  last_review: iso(0), due_at: iso(0), prior_known_at: null, verified_at: null,
}

const DECK = [CLAIMED, VERIFIED, MASTERED, LEARNING]
const byId = Object.fromEntries(DECK.map(c => [c.vocab_id, c]))

describe('one deck, every consumer — the claim never counts as taught', () => {
  it('knowledgeState is the reference answer', () => {
    expect(isPriorKnown(CLAIMED)).toBe(true)
    expect(isLearned(CLAIMED)).toBe(false)
    expect(isMastered(CLAIMED)).toBe(false)
    expect(countsForReading(CLAIMED)).toBe(true)
  })

  it('the reader treats it as its own status, and as known', () => {
    expect(readerStatus('v-claim', byId)).toBe('prior_known')
    expect(readerStatus('v-mastered', byId)).toBe('review')
    expect(readerStatus('v-learning', byId)).toBe('learning')
    expect(readerStatus('v-missing', byId)).toBe('not_started')
  })

  it('the dictionary shows it as previously-known, never mastered', () => {
    expect(cardStatus(CLAIMED)).toBe('prior_known')
    expect(cardStatus(MASTERED)).toBe('mastered')
    expect(cardStatus(LEARNING)).toBe('learning')
  })

  it('the known-word map buckets it apart from taught words, but as readable', () => {
    expect(mapStatus(CLAIMED)).toBe('prior_known')
    const vocab = DECK.map((c, i) => ({ id: c.vocab_id, level: 1 + i * 0 }))
    const { totals } = knownWordMap(vocab, byId)
    expect(totals.prior_known).toBe(1)
    expect(totals.mastered).toBe(1)
    expect(totals.known).toBe(1)      // the verified review card
    expect(totals.learning).toBe(1)
    expect(totals.readable).toBe(3)   // mastered + known + prior_known
  })

  it('progress counts it separately from learned and mastered', () => {
    const out = countMastery(DECK, 4)
    expect(out.masteredCount).toBe(1)
    expect(out.learnedCount).toBe(2)     // verified + mastered
    expect(out.priorKnownCount).toBe(1)
    expect(out.masteredPct).toBeCloseTo(0.25)
  })

  it('story tier gates DO count it (comprehension is the low bar)', () => {
    const vocab = DECK.map(c => ({ id: c.vocab_id, level: 1 }))
    // claim + verified + mastered = 3; the learning card does not count.
    expect(learnedByLevel(vocab, DECK)).toEqual({ 1: 3 })
  })

  it('no queue serves it', () => {
    expect(isCardDue(CLAIMED, now)).toBe(false)
    expect(dueReviewCards(DECK, now).map(c => c.vocab_id)).toEqual(['v-verified'])
    expect(dueLearningCards(DECK, now).map(c => c.vocab_id)).toEqual(['v-learning'])
    expect(weakCards(DECK)).toEqual([])
  })

  it('the study floor ignores it', () => {
    const placed = [
      { ...CLAIMED, vocabulary: { level: 1 } },
      { ...VERIFIED, vocabulary: { level: 3 } },
    ]
    expect(studyFloorLevel(placed, 3)).toBe(3)
  })
})

describe('the level test cannot be unlocked by claiming', () => {
  const vocabResult = (n) => ({ data: Array.from({ length: n }, (_, i) => ({ id: 'w' + i })), error: null })
  const noUnlock = { data: null, error: null }
  const claims = (n) => Array.from({ length: n }, (_, i) => ({ ...priorKnownCardRow('u1', 'w' + i, 'checklist', NOW), vocab_id: 'w' + i }))

  it('"Claim all" on a full level yields zero mastery', () => {
    const status = resolveTestStatus(vocabResult(453), claims(453), noUnlock)
    expect(status.masteredCount).toBe(0)
    expect(status.masteredPct).toBe(0)
    expect(status.unlockedByMastery).toBe(false)
  })

  // Decision 7: claiming a level does open the DOOR to the test — otherwise an
  // experienced learner would have to calibrate hundreds of words to progress —
  // but the test itself is still 30 of 30 correct, and passing writes no
  // per-word FSRS state.
  it('but it does make the learner eligible to SIT the test', () => {
    const status = resolveTestStatus(vocabResult(453), claims(453), noUnlock)
    expect(status.coveragePct).toBe(1)
    expect(status.testUnlocked).toBe(true)
    expect(status.unlockedByMastery).toBe(false)   // framed as "prove it", not "you're ready"
  })

  it('a partial claim below the coverage bar opens nothing', () => {
    const status = resolveTestStatus(vocabResult(100), claims(50), noUnlock)
    expect(status.coveragePct).toBeCloseTo(0.5)
    expect(status.testUnlocked).toBe(false)
  })

  it('genuine mastery still unlocks it, and says so', () => {
    const mastered = Array.from({ length: 90 }, (_, i) => ({ vocab_id: 'w' + i, reps: 5, stability: 40 }))
    const status = resolveTestStatus(vocabResult(100), mastered, noUnlock)
    expect(status.masteredPct).toBeCloseTo(0.9)
    expect(status.unlockedByMastery).toBe(true)
    expect(status.testUnlocked).toBe(true)
  })

  // The pre-migration production shape: 594 rows at stability exactly 21 with
  // zero reps. These must not unlock anything even before the data migration.
  it('the legacy fabricated shape unlocks nothing', () => {
    const fabricated = Array.from({ length: 100 }, (_, i) => ({
      vocab_id: 'w' + i, state: 'review', reps: 0, stability: 21, learned: true,
    }))
    const status = resolveTestStatus(vocabResult(100), fabricated, noUnlock)
    expect(status.masteredCount).toBe(0)
    expect(status.testUnlocked).toBe(false)
  })
})

describe('story readability counts a claim as known and reports it separately', () => {
  const vocabMap = {
    我: { id: 'v-claim', word: '我' },
    你: { id: 'v-mastered', word: '你' },
    他: { id: 'v-learning', word: '他' },
    她: { id: 'v-unknown', word: '她' },
  }

  it('knownCount includes the claim; assumedCount isolates it', () => {
    const r = calculateStoryReadability({
      content: '我你他她', vocabMap, cards: byId, language: 'chinese',
    })
    expect(r.totalUnique).toBe(4)
    expect(r.knownCount).toBe(2)     // claim + mastered
    expect(r.assumedCount).toBe(1)   // of which one rests on a claim
    expect(r.learningCount).toBe(1)
    expect(r.newCount).toBe(1)
    expect(r.knownPct).toBe(50)
  })

  it('reading coverage aggregates claims with genuine knowledge', () => {
    expect(readingCoveragePct(DECK, 4)).toBeCloseTo(0.75)
  })
})
