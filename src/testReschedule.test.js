import { describe, it, expect } from 'vitest'
import { testWrongAnswerWrite, testResultSummaryLine, TEST_WRONG_GRADE } from './testReschedule'
import { isPriorKnown } from './knowledgeState'

// FAB-28 finding 5. A wrong answer on the level test used to be written to
// `cards` with a bare UPDATE whose error was never read. On a prior-knowledge
// claim the database rejected it outright — cards_unverified_claim_is_inert
// forbids scheduler state on a row that is still a claim — so the learner got
// the word wrong, nothing was rescheduled, and the word kept counting as known
// for reading and for story unlocks. Production holds 588 such claims.

const claim = (over = {}) => ({
  id: 'card-claim',
  vocab_id: 'v-claim',
  state: 'new',
  prior_known_at: '2026-08-01T00:00:00Z',
  verified_at: null,
  reps: 0,
  due_at: '2026-08-20T00:00:00Z',
  stability: 0,
  difficulty: 0,
  lapses: 0,
  learning_step: 0,
  interval_days: 0,
  last_review: null,
  ...over,
})

const studied = (over = {}) => ({
  id: 'card-studied',
  vocab_id: 'v-studied',
  state: 'review',
  prior_known_at: null,
  verified_at: '2026-08-10T00:00:00Z',
  reps: 4,
  due_at: '2026-08-20T00:00:00Z',
  stability: 12,
  difficulty: 5,
  lapses: 0,
  learning_step: 0,
  interval_days: 12,
  last_review: '2026-08-08T00:00:00Z',
  ...over,
})

describe('a wrong answer on the level test', () => {
  it('builds a write for an ordinary studied card, with a review log', () => {
    const p = testWrongAnswerWrite(studied())
    expect(p.cardId).toBe('card-studied')
    expect(p.vocabId).toBe('v-studied')
    // The log is what keeps `reps` honest — CLAUDE.md §7.3b. The old bare
    // UPDATE incremented reps with no log at all; production shows 61 cards
    // with reps and no log, and 104 where reps exceeds the log count.
    expect(p.log).toMatchObject({
      grade: TEST_WRONG_GRADE,
      previous_state: 'review',
      previous_interval_days: 12,
    })
    expect(p.log.next_state).toBe(p.updates.state)
    expect(p.updates.reps).toBeGreaterThan(4)
  })

  it('does not stamp verification on a card that was never a claim', () => {
    // verified_at is how a claim stops being a claim. A card that was already
    // studied has nothing to un-claim, and writing the field would be inventing
    // a verification event.
    expect(testWrongAnswerWrite(studied()).updates.verified_at).toBeUndefined()
  })

  // The database constraint, restated in JS so a spec can hold the write to it.
  // cards_unverified_claim_is_inert (migration 20260822160000, confirmed
  // applied in production): a row that still has prior_known_at set and
  // verified_at null may carry NO scheduler state. Encoded here because a
  // comment cannot fail a build.
  const violatesInertClaim = (row) =>
    Boolean(row.prior_known_at) && !row.verified_at && (
      (row.reps || 0) > 0 ||
      (row.stability || 0) > 0 ||
      Boolean(row.last_review) ||
      (row.state && row.state !== 'new')
    )

  it('produces a write the inert-claim constraint would ACCEPT', () => {
    const card = claim()
    // The old write, reconstructed: scheduler state, claim left standing.
    expect(violatesInertClaim({ ...card, state: 'learning', reps: 1, stability: 3, last_review: 'x' }))
      .toBe(true)
    // The new one.
    expect(violatesInertClaim({ ...card, ...testWrongAnswerWrite(card).updates }))
      .toBe(false)
  })

  it('produces a LEGAL write for a prior-knowledge claim', () => {
    // The whole defect. cards_unverified_claim_is_inert rejects any row that
    // still has prior_known_at set, verified_at null, AND scheduler state. The
    // old write set state/reps/stability/last_review and left verified_at null,
    // so Postgres refused it and Test.jsx never read the error.
    const p = testWrongAnswerWrite(claim())
    expect(p.updates.verified_at, 'the claim was left unverified, so this write is illegal')
      .toEqual(expect.any(String))
    expect(p.updates.reps).toBeGreaterThanOrEqual(1)
    expect(p.updates.state).not.toBe('new')
  })

  it('actually ends the claim, so the word stops counting as known', () => {
    // The property the learner feels. Applying the update must move the row out
    // of prior_known — otherwise it keeps counting for reading and keeps
    // unlocking story tiers for a word just demonstrated to be unknown.
    const card = claim()
    expect(isPriorKnown(card)).toBe(true)
    const after = { ...card, ...testWrongAnswerWrite(card).updates }
    expect(isPriorKnown(after)).toBe(false)
  })

  it('grades Again, not something gentler', () => {
    // The claim is refuted. Anything above Again would let a word the learner
    // just failed keep a schedule built on the claim.
    expect(TEST_WRONG_GRADE).toBe(0)
    expect(testWrongAnswerWrite(claim()).log.grade).toBe(0)
    expect(testWrongAnswerWrite(studied()).log.grade).toBe(0)
  })

  it('returns nothing for a card the caller does not have', () => {
    // The test fetches cards by vocab_id; a word with no row yet has nothing to
    // reschedule. One shape, so the caller needs no guard of its own.
    expect(testWrongAnswerWrite(null)).toBeNull()
    expect(testWrongAnswerWrite(undefined)).toBeNull()
    expect(testWrongAnswerWrite({ vocab_id: 'v', id: null })).toBeNull()
  })
})

describe('what the result screen tells the learner', () => {
  it('says the words came back only when they did', () => {
    expect(testResultSummaryLine({ passed: false, wrongCount: 3 }))
      .toBe('3 wrong words have been returned to review. You need 100% to pass.')
  })

  it('does NOT claim the words came back when the write failed', () => {
    // The sentence that was false. It was printed unconditionally, including
    // when every one of those writes had just been rejected.
    const line = testResultSummaryLine({ passed: false, wrongCount: 3, rescheduleFailed: true })
    expect(line).not.toMatch(/have been returned to review/)
    expect(line).toMatch(/could not be returned to review/)
    expect(line).toMatch(/100% to pass/)
  })

  it('keeps the pass line unchanged, failure or not', () => {
    const pass = 'All correct. Your next level is now unlocking.'
    expect(testResultSummaryLine({ passed: true, wrongCount: 0 })).toBe(pass)
    expect(testResultSummaryLine({ passed: true, wrongCount: 0, rescheduleFailed: true })).toBe(pass)
  })

  it('agrees with itself about one word', () => {
    expect(testResultSummaryLine({ passed: false, wrongCount: 1 })).toMatch(/^1 wrong word /)
    expect(testResultSummaryLine({ passed: false, wrongCount: 2 })).toMatch(/^2 wrong words /)
  })
})
