import { describe, it, expect } from 'vitest'
import { dueLearningCards, dueReviewCards, weakCards } from './studyAvailability'

// The regression these exist for: Home promised a smaller session than Study
// delivered. Home scoped its counts to the current level window; Study serves
// every card in the track, because a card only exists if the learner chose to
// study that word. On production that hid 62 due reviews across 4 accounts.
//
// Anything asserting on a due date runs under TZ=UTC (vitest.config.js), and
// availability is day-based — a card due at any point today is available from
// local midnight.

const AT = new Date('2026-08-15T09:00:00Z')

const card = (over = {}) => ({
  vocab_id: 'v', state: 'review', due_at: AT.toISOString(), lapses: 0, stability: 0, ...over,
})

describe('dueReviewCards', () => {
  it('serves every review scheduled for today, from local midnight', () => {
    const deck = [
      card({ vocab_id: 'morning', due_at: '2026-08-15T00:00:00Z' }),
      card({ vocab_id: 'tonight', due_at: '2026-08-15T23:30:00Z' }),
    ]
    expect(dueReviewCards(deck, AT).map(c => c.vocab_id)).toEqual(['morning', 'tonight'])
  })

  it('excludes reviews scheduled for a later day', () => {
    expect(dueReviewCards([card({ due_at: '2026-08-16T00:30:00Z' })], AT)).toEqual([])
  })

  it('counts a due card whose word is outside the level window', () => {
    // A word saved from the dictionary (no level) or from a story above the
    // learner's level. Study has always served these; Home used to hide them.
    const deck = [card({ vocab_id: 'saved-from-story' })]
    expect(dueReviewCards(deck, AT)).toHaveLength(1)
  })

  it('ignores learning and new cards', () => {
    const deck = [card({ state: 'learning' }), card({ state: 'relearning' }), card({ state: 'new' })]
    expect(dueReviewCards(deck, AT)).toEqual([])
  })
})

describe('dueLearningCards', () => {
  it('takes learning and relearning, not review', () => {
    const deck = [
      card({ vocab_id: 'l', state: 'learning' }),
      card({ vocab_id: 'r', state: 'relearning' }),
      card({ vocab_id: 'rev', state: 'review' }),
    ]
    expect(dueLearningCards(deck, AT).map(c => c.vocab_id)).toEqual(['l', 'r'])
  })

  it('excludes a learning card that is not due yet', () => {
    expect(dueLearningCards([card({ state: 'learning', due_at: '2026-08-20T00:00:00Z' })], AT)).toEqual([])
  })
})

describe('weakCards', () => {
  it('takes cards lapsed twice or more that are not yet mastered', () => {
    const deck = [
      card({ vocab_id: 'weak', lapses: 2, stability: 3 }),
      card({ vocab_id: 'once', lapses: 1, stability: 3 }),
      card({ vocab_id: 'recovered', lapses: 5, stability: 21 }),
    ]
    expect(weakCards(deck).map(c => c.vocab_id)).toEqual(['weak'])
  })

  it('is not due-gated — the drill is available whenever the learner wants it', () => {
    expect(weakCards([card({ lapses: 3, stability: 1, due_at: '2027-01-01T00:00:00Z' })])).toHaveLength(1)
  })
})

describe('empty and missing decks', () => {
  it('never throws on null/undefined', () => {
    for (const deck of [null, undefined, []]) {
      expect(dueLearningCards(deck, AT)).toEqual([])
      expect(dueReviewCards(deck, AT)).toEqual([])
      expect(weakCards(deck)).toEqual([])
    }
  })
})

describe('Home and Study agree', () => {
  // Home renders `dueCount + learnCount` as what is waiting; Study builds its
  // queue from the same two functions over the same deck. Pinning the identity
  // here is what stops the next refactor from re-splitting them.
  it('the Home count equals the cards the session will serve', () => {
    const deck = [
      card({ vocab_id: 'in-level' }),
      card({ vocab_id: 'above-level' }),
      card({ vocab_id: 'no-level' }),
      card({ vocab_id: 'learning', state: 'learning' }),
      card({ vocab_id: 'not-yet', due_at: '2026-09-01T00:00:00Z' }),
    ]
    const homeCount = dueReviewCards(deck, AT).length + dueLearningCards(deck, AT).length
    const sessionCards = [...dueLearningCards(deck, AT), ...dueReviewCards(deck, AT)]
    expect(homeCount).toBe(sessionCards.length)
    expect(homeCount).toBe(4)
  })
})

describe('durable review availability and genuine introductions', () => {
  it('never serves a pending card in due or weak pools', async () => {
    const { dueLearningCards, dueReviewCards, weakCards } = await import('./studyAvailability')
    const pending = { review_pending: true, due_at: '2000-01-01', lapses: 3, stability: 1 }
    expect(dueLearningCards([{ ...pending, state: 'learning' }])).toEqual([])
    expect(dueReviewCards([{ ...pending, state: 'review' }])).toEqual([])
    expect(weakCards([{ ...pending, state: 'review' }])).toEqual([])
  })
  it('serves inert saved or undone new rows but excludes pending and prior claims', async () => {
    const { isEligibleNewCard } = await import('./studyAvailability')
    expect(isEligibleNewCard({ state: 'new', reps: 0, id: 'saved' })).toBe(true)
    expect(isEligibleNewCard({ state: 'new', reps: 0, review_pending: true })).toBe(false)
    expect(isEligibleNewCard({ state: 'new', reps: 0, prior_known_at: '2026-09-01' })).toBe(false)
  })
  it('uses first observed date, not the date an inert row was saved', async () => {
    const { introducedTodayCards } = await import('./studyAvailability')
    const today = new Date(2026, 8, 28, 12)
    const start = new Date(2026, 8, 28, 9).toISOString()
    const old = new Date(2026, 8, 20).toISOString()
    const rows = [
      { id: 'saved', reps: 0, created_at: start },
      { id: 'observed', reps: 1, created_at: old, first_reviewed_at: start },
      { id: 'claim', reps: 1, created_at: start, prior_known_at: old },
      { id: 'tomorrow', reps: 1, created_at: new Date(2026, 8, 29).toISOString() },
    ]
    expect(introducedTodayCards(rows, today).map(row => row.id)).toEqual(['observed'])
  })
})
