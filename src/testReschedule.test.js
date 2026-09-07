import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { testWrongAnswerWrite, testResultSummaryLine, TEST_WRONG_GRADE, TEST_CARD_COLUMNS } from './testReschedule'
import { isPriorKnown } from './knowledgeState'

// Fixtures are built from the columns Test.jsx ACTUALLY fetches, not from a
// hand-written object. That distinction is the whole reason this guard exists:
// the first version of these specs set `prior_known_at` on every claim fixture
// while the real SELECT omitted it, so `isPriorKnown()` read undefined, the
// claim branch never ran in the app, and the suite was green anyway. A spec
// that supplies a column the caller does not fetch proves a property of the
// fixture and nothing else.
const FETCHED = new Set(TEST_CARD_COLUMNS.split(',').map(c => c.trim()))
const asFetched = (row) => {
  for (const k of Object.keys(row)) {
    if (!FETCHED.has(k)) throw new Error('fixture sets a column Test.jsx does not SELECT: ' + k)
  }
  return row
}

// FAB-28 finding 5. A wrong answer on the level test used to be written to
// `cards` with a bare UPDATE whose error was never read. On a prior-knowledge
// claim the database rejected it outright — cards_unverified_claim_is_inert
// forbids scheduler state on a row that is still a claim — so the learner got
// the word wrong, nothing was rescheduled, and the word kept counting as known
// for reading and for story unlocks. Production holds 588 such claims.

const claim = (over = {}) => asFetched({
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

const studied = (over = {}) => asFetched({
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
  // Every conjunct of the real CHECK, not a summary of it. The first version
  // restated four of eight and used `stability > 0` where the database demands
  // `stability is null` — so a write with stability 0, a non-null difficulty, a
  // lapse, or learned/is_easy true passed the JS and would have been rejected
  // by Postgres. A restatement weaker than the constraint proves less than it
  // appears to.
  const violatesInertClaim = (row) =>
    Boolean(row.prior_known_at) && !row.verified_at && !(
      row.state === 'new'
      && (row.reps || 0) === 0
      && (row.lapses || 0) === 0
      && (row.stability === null || row.stability === undefined)
      && (row.difficulty === null || row.difficulty === undefined)
      && (row.last_review === null || row.last_review === undefined)
      && row.learned !== true
      && row.is_easy !== true
    )

  it('the restatement rejects every shape the real constraint rejects', () => {
    // Without these the extra conjuncts are decoration: no other fixture sets
    // learned, is_easy, lapses or difficulty, so weakening the restatement back
    // to its first four terms would change no result. Each row below is legal
    // under the weak version and illegal under the database's.
    const base = { prior_known_at: '2026-08-01T00:00:00Z', verified_at: null, state: 'new' }
    for (const [label, extra] of [
      ['learned true', { learned: true }],
      ['is_easy true', { is_easy: true }],
      ['a lapse', { lapses: 1 }],
      ['a non-null difficulty', { difficulty: 0 }],
      ['stability 0 rather than null', { stability: 0 }],
    ]) {
      expect(violatesInertClaim({ ...base, ...extra }), label + ' must be refused').toBe(true)
    }
  })

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
  it('says the words came back only when they all did', () => {
    expect(testResultSummaryLine({ passed: false, wrongCount: 3, rescheduled: 3 }))
      .toBe('3 wrong words have been returned to review. You need 100% to pass.')
    // Absent `rescheduled` means the ordinary path where every write landed.
    expect(testResultSummaryLine({ passed: false, wrongCount: 3 }))
      .toBe('3 wrong words have been returned to review. You need 100% to pass.')
  })

  it('does NOT claim the words came back when nothing was written', () => {
    const line = testResultSummaryLine({ passed: false, wrongCount: 3, rescheduled: 0 })
    expect(line).not.toMatch(/have been returned to review/)
    expect(line).toMatch(/could not be returned to review/)
    expect(line).toMatch(/100% to pass/)
  })

  it('is honest about a PARTIAL result rather than rounding it either way', () => {
    // Two writes land, one fails. "3 returned" is false for the third and
    // "none returned" is false for the first two.
    const line = testResultSummaryLine({ passed: false, wrongCount: 3, rescheduled: 2 })
    expect(line).toMatch(/^2 of 3 wrong words have been returned to review\./)
    expect(line).toMatch(/The rest stay as they were/)
  })

  it('keeps the pass line unchanged, whatever happened to the writes', () => {
    const pass = 'All correct. Your next level is now unlocking.'
    expect(testResultSummaryLine({ passed: true, wrongCount: 0 })).toBe(pass)
    expect(testResultSummaryLine({ passed: true, wrongCount: 0, rescheduled: 0 })).toBe(pass)
  })

  it('agrees with itself about one word', () => {
    expect(testResultSummaryLine({ passed: false, wrongCount: 1 })).toMatch(/^1 wrong word /)
    expect(testResultSummaryLine({ passed: false, wrongCount: 2 })).toMatch(/^2 wrong words /)
    // The old inline ternary said "1 wrong words".
    expect(testResultSummaryLine({ passed: false, wrongCount: 1 })).not.toMatch(/1 wrong words/)
  })
})

describe('the caller fetches what this module reads', () => {
  it('Test.jsx selects the columns the branch depends on', () => {
    // The spec that would have caught the defect these were rewritten for.
    // testWrongAnswerWrite branches on isPriorKnown, which reads prior_known_at
    // and reps. The SELECT omitted prior_known_at, so the predicate was always
    // false, the claim branch was dead, and every fixture that set the column
    // was describing a row the app never builds.
    const src = readFileSync('src/Test.jsx', 'utf8')
    expect(src, 'Test.jsx no longer uses the shared column list')
      .toMatch(/\.select\(TEST_CARD_COLUMNS\)/)
    for (const col of ['prior_known_at', 'verified_at', 'reps', 'interval_days']) {
      expect(TEST_CARD_COLUMNS.split(',').map(c => c.trim()), 'missing column: ' + col)
        .toContain(col)
    }
  })

  it('the branch really is reachable with a fetched row', () => {
    // Not "a claim produces a claim write" — that was already asserted against a
    // fabricated row. This asserts the row SHAPE the caller actually produces
    // reaches the claim branch, which is what was broken.
    const row = claim()
    expect(isPriorKnown(row), 'a fetched claim row no longer reads as a claim').toBe(true)
    expect(testWrongAnswerWrite(row).updates.verified_at).toEqual(expect.any(String))
  })
})
