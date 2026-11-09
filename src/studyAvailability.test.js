import { describe, it, expect } from 'vitest'
import { dueLearningCards, dueReviewCards, weakCards } from './studyAvailability'
import { homeQueueSummary } from './homePresentation'
import { pickCalibrationChecks, isCalibrationReady, CALIBRATION_SESSION_CAP } from './calibration'

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
  // What this suite is FOR: Home's promise and the session's delivery must be
  // the same number. The previous version of this test could not check that.
  // It computed `dueReviewCards(deck) + dueLearningCards(deck)` on one side and
  // `[...dueLearningCards(deck), ...dueReviewCards(deck)]` on the other — the
  // same two calls, so the assertion was true by construction and no divergence
  // could ever fail it. It then carried a name claiming to pin exactly the
  // invariant that had already broken: calibration checks were in the session
  // and in no Home count at all.
  //
  // So both sides are now built the way the real code builds them: Home through
  // homeQueueSummary over a counts object, the session through the same
  // selection functions sessionPrep uses.

  it('the Home count equals the cards the session will serve', () => {
    const deck = [
      card({ vocab_id: 'in-level' }),
      card({ vocab_id: 'above-level' }),
      card({ vocab_id: 'no-level' }),
      card({ vocab_id: 'learning', state: 'learning' }),
      card({ vocab_id: 'not-yet', due_at: '2026-09-01T00:00:00Z' }),
    ]
    // Home's side goes through the presentation function the screen calls,
    // not through a re-addition of the same two selectors.
    const home = homeQueueSummary({
      learnCount: dueLearningCards(deck, AT).length,
      dueCount: dueReviewCards(deck, AT).length,
      calibrationCount: 0,
      newCount: 0,
    })
    const sessionCards = [...dueLearningCards(deck, AT), ...dueReviewCards(deck, AT)]
    expect(home.totalReady).toBe(sessionCards.length)
    expect(home.totalReady).toBe(4)
  })

  it('agrees when the session is nothing but calibration checks', () => {
    // The case that was silently wrong. Claims are inert — never due, never
    // offered as new — so both selectors return nothing and Home used to
    // total 0 while the session served up to CALIBRATION_SESSION_CAP of them.
    const claims = Array.from({ length: 5 }, (_, i) => ({
      vocab_id: 'claim-' + i,
      vocab: { level: 1, sort_order: i },
      state: 'new',
      prior_known_at: '2026-08-01T00:00:00Z',
      reps: 0,
      due_at: AT.toISOString(),
      lapses: 0,
      stability: 0,
    }))

    expect(dueLearningCards(claims, AT)).toEqual([])
    expect(dueReviewCards(claims, AT)).toEqual([])

    const served = pickCalibrationChecks(claims, { now: AT })
    const home = homeQueueSummary({
      learnCount: dueLearningCards(claims, AT).length,
      dueCount: dueReviewCards(claims, AT).length,
      // Counted exactly as getHomeCounts counts it.
      calibrationCount: Math.min(
        claims.filter(c => isCalibrationReady(c, AT)).length,
        CALIBRATION_SESSION_CAP,
      ),
      newCount: 0,
    })

    expect(served).toHaveLength(5)
    expect(home.totalReady).toBe(served.length)
    expect(home.clear).toBe(false)
  })

  it('agrees at the cap, where the session serves fewer than are ready', () => {
    // Home must promise what the session DELIVERS, not the backlog. Twice the
    // cap are ready; both sides must land on the cap.
    const many = Array.from({ length: CALIBRATION_SESSION_CAP * 2 }, (_, i) => ({
      vocab_id: 'claim-' + i,
      vocab: { level: 1, sort_order: i },
      state: 'new',
      prior_known_at: '2026-08-01T00:00:00Z',
      reps: 0,
      due_at: AT.toISOString(),
      lapses: 0,
      stability: 0,
    }))
    const served = pickCalibrationChecks(many, { now: AT })
    const home = homeQueueSummary({
      calibrationCount: Math.min(
        many.filter(c => isCalibrationReady(c, AT)).length,
        CALIBRATION_SESSION_CAP,
      ),
    })
    expect(served).toHaveLength(CALIBRATION_SESSION_CAP)
    expect(home.totalReady).toBe(served.length)
  })

  it('counts no check for a claim that is not ready yet', () => {
    // spreadDueDates paces claims by writing a future date into due_at, which
    // is inert to every other queue. Home must not count one that the session
    // will not serve — the over-promise direction of the same bug.
    const notYet = [{
      vocab_id: 'later',
      vocab: { level: 1, sort_order: 0 },
      state: 'new',
      prior_known_at: '2026-08-01T00:00:00Z',
      reps: 0,
      due_at: '2026-09-01T00:00:00Z',
      lapses: 0,
      stability: 0,
    }]
    expect(pickCalibrationChecks(notYet, { now: AT })).toEqual([])
    expect(notYet.filter(c => isCalibrationReady(c, AT))).toEqual([])
  })

  it('counts no check for a claim that has already been observed', () => {
    // reps >= 1 means it stopped being a claim. Counting it would resurrect a
    // finished check every time Home loaded.
    const verified = [{
      vocab_id: 'done',
      vocab: { level: 1, sort_order: 0 },
      state: 'review',
      prior_known_at: '2026-08-01T00:00:00Z',
      reps: 1,
      due_at: AT.toISOString(),
      lapses: 0,
      stability: 5,
    }]
    expect(pickCalibrationChecks(verified, { now: AT })).toEqual([])
    expect(verified.filter(c => isCalibrationReady(c, AT))).toEqual([])
  })
})
