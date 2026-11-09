import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Resolved against this file, not the process cwd. Every other source-reading
// spec in the repo does it this way; the cwd-relative form is the one guard
// protecting the fix below and was the only one written fragile.
const srcFile = (name) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8')
import {
  testWrongAnswerWrite, testResultSummaryLine, tallyTestReschedules, newTestCard,
  TEST_WRONG_GRADE, TEST_CARD_COLUMNS,
} from './testReschedule'
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

  it('returns nothing only for something that is not a word', () => {
    expect(testWrongAnswerWrite(null)).toBeNull()
    expect(testWrongAnswerWrite(undefined)).toBeNull()
    expect(testWrongAnswerWrite({ id: 'c1' })).toBeNull()
  })

  it('writes a word the learner has no card for yet', () => {
    // The level test unlocks at 90% coverage and draws from the whole level, so
    // up to a tenth of its words have no row — and for a learner who got there
    // by coverage, that unstudied tail is the likeliest source of wrong answers.
    // These used to return null and be reported as "could not be returned to
    // review just now — take the test again when you are back online", which
    // was false in every clause.
    const write = testWrongAnswerWrite(newTestCard('v-new'))
    expect(write, 'a word with no card must still be written').not.toBeNull()
    expect(write.cardId, 'gradeCardWrite takes cardId null for the insert branch').toBeNull()
    expect(write.vocabId).toBe('v-new')
    // A real first observation: state leaves 'new' and reps is 1, both from
    // srs.schedule() rather than written here.
    expect(write.updates.reps).toBe(1)
    expect(write.updates.state).not.toBe('new')
    expect(write.log.previous_state).toBe('new')
  })

  it('builds the same new-card shape sessionPrep hands Study', () => {
    // Two modules describing one thing. If sessionPrep's newItems gains a field
    // the scheduler reads, a card created from the level test would be graded
    // from a different starting shape than the same word graded in Study.
    const prep = srcFile('./sessionPrep.js')
    const block = prep.slice(prep.indexOf('const newItems'), prep.indexOf('// Prior-knowledge checks'))
    // Names AND values. Comparing key names alone said only that the two
    // objects have the same shape — sessionPrep could change learning_step to 1
    // and a card created by the level test would still start from 0, which the
    // scheduler reads.
    const pairs = [...block.matchAll(/([a-z_]+):\s*('[^']*'|-?\d+|null|true|false)/g)]
    expect(pairs.length, 'could not parse sessionPrep newItems').toBeGreaterThan(3)
    const mine = newTestCard('v')
    for (const [, key, raw] of pairs) {
      // ease_factor is the dead SM-2 column (CLAUDE.md §10) and is deliberately
      // not carried here; claude/fab-28-no-ease-factor-writes removes it there.
      // vocab_id and id are per-call, not part of the starting shape.
      if (['ease_factor', 'vocab', 'vocab_id', 'id'].includes(key)) continue
      expect(Object.keys(mine), 'sessionPrep starts a new card with ' + key + ' and this does not')
        .toContain(key)
      const expected = raw === 'null' ? null
        : raw === 'true' ? true
          : raw === 'false' ? false
            : raw.startsWith("'") ? raw.slice(1, -1) : Number(raw)
      expect(mine[key], 'sessionPrep starts ' + key + ' at ' + raw + ' and this does not')
        .toBe(expected)
    }
  })
})

describe('the tally the result sentence rests on', () => {
  it('counts what landed, not what was attempted', () => {
    const err = { message: 'nope' }
    expect(tallyTestReschedules([{ ok: true }, { ok: false, error: err }, { ok: true }]))
      .toEqual({ rescheduled: 2, attempted: 3, failed: 1, firstError: err })
  })

  it('reports nothing attempted as nothing rescheduled', () => {
    // The lookup-failed path: no writes were made, so no word came back.
    expect(tallyTestReschedules([])).toEqual({ rescheduled: 0, attempted: 0, failed: 0, firstError: null })
    expect(tallyTestReschedules(null).rescheduled).toBe(0)
  })

  it('keeps the first error rather than the last', () => {
    const first = { message: 'first' }
    expect(tallyTestReschedules([{ ok: false, error: first }, { ok: false, error: { message: 'second' } }]).firstError)
      .toBe(first)
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
    const src = srcFile('./Test.jsx')
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


  it('does not tell a learner to retake a test the screen will not offer', () => {
    // At three attempts the screen hides both the attempts line and the Try
    // again button, and the failure sentence was still saying "take the test
    // again when you are back online" — advice for a thing the app refuses.
    const failed = { passed: false, wrongCount: 3, rescheduled: 0 }
    expect(testResultSummaryLine({ ...failed, canRetry: true })).toMatch(/Take the test again/)
    expect(testResultSummaryLine({ ...failed, canRetry: false })).not.toMatch(/Take the test again/)
    // The part that is true either way still gets said.
    expect(testResultSummaryLine({ ...failed, canRetry: false })).toMatch(/They stay as they were/)
    // Same on the partial branch.
    const partial = { passed: false, wrongCount: 3, rescheduled: 1 }
    expect(testResultSummaryLine({ ...partial, canRetry: false })).not.toMatch(/Take the test again/)
    expect(testResultSummaryLine({ ...partial, canRetry: false })).toMatch(/^1 of 3 /)
  })

  it('the caller passes the retry state it actually renders', () => {
    expect(readFileSync(fileURLToPath(new URL('./Test.jsx', import.meta.url)), 'utf8'))
      .toMatch(/canRetry: attempts\.count < 3/)
  })

describe('the caller measures before it claims', () => {
  const src = () => srcFile('./Test.jsx')

  it('reads the lookup error instead of treating no rows as no cards', () => {
    // With the error dropped, a failed SELECT looked like "none of these words
    // has a card" — and now that a card-less word gets a NEW card, that would
    // rebuild a mature row from scratch through grade_card's upsert. Nothing
    // may be written when the lookup fails.
    const code = src()
    expect(code, 'the cards lookup no longer reads its error')
      .toMatch(/error:\s*lookupError/)
    expect(code, 'the write loop no longer skips a failed lookup')
      .toMatch(/if \(lookupError\)/)
    // POSITIONAL, because the two regexes above both still match if the `else`
    // is deleted — and then the loop runs on a failed lookup, every mature card
    // looks card-less, and the upsert rebuilds it from an empty card. The
    // property is "the write loop is INSIDE the else", so that is what is
    // asserted.
    const guard = code.indexOf('if (lookupError)')
    const loop = code.indexOf('for (const w of finalWrong)')
    expect(guard, 'the failed-lookup guard is gone').toBeGreaterThan(-1)
    expect(loop, 'the write loop is gone').toBeGreaterThan(guard)
    // The else must be the guard's OWN, not some later one in the file: only
    // the text between the guard and the loop counts. Deleting `} else {` there
    // — which leaves both regexes above matching and the loop running on a
    // failed lookup — leaves this window without one.
    const between = code.slice(guard, loop)
    expect(between, 'the write loop is no longer inside the failed-lookup else')
      .toMatch(/\}\s*else\s*\{/)
  })

  it('goes through the canonical grade write, not a bare UPDATE', () => {
    // The mutation that reverts the entire fix, and which no spec could see
    // before: swapping gradeCardWrite back for supabase.from('cards').update().
    const code = src()
    expect(code).toMatch(/gradeCardWrite\(supabase, \{/)
    expect(code, "a bare cards UPDATE is back in Test.jsx")
      .not.toMatch(/from\('cards'\)\s*\.update\(/)
  })

  it('gives a word with no card one, rather than counting it as a failure', () => {
    expect(src()).toMatch(/cardByVocabId\[w\.id\] \|\| newTestCard\(w\.id\)/)
  })

  it('builds the result line from the tested tally', () => {
    expect(src()).toMatch(/tallyTestReschedules\(results\)/)
  })

  it('grades each wrong word once', () => {
    // Two review_logs rows for one wrong answer is the same history corruption
    // this change exists to stop, and the End-quiz confirm could produce it.
    //
    // BOTH halves. `has` alone still matched with the `add` deleted, which
    // makes the set permanently empty and the dedupe a no-op — green, and
    // exactly as broken as no dedupe at all.
    const code = src()
    expect(code).toMatch(/seenWrong\.has\(w\.id\)/)
    expect(code, 'the dedupe set is never added to, so it never dedupes')
      .toMatch(/seenWrong\.add\(w\.id\)/)
  })

  it('cannot finish the same attempt twice', () => {
    // The 1.5s answer-feedback pause is a live second copy of the finish path:
    // answer the LAST question, click "End now" inside it, and the timer still
    // fires with index + 1 === questions.length. finishTest ran twice — a
    // second test_attempts row (one of three daily attempts, silently gone) and
    // every wrong word graded twice with two different opIds, which
    // grade_card's client_op_id de-dupe cannot collapse.
    const code = src()
    expect(code, 'the feedback timer is not held, so End-quiz cannot cancel it')
      .toMatch(/feedbackTimer\.current = setTimeout/)
    // Scoped to handleEndQuiz. The unmount cleanup clears the same timer, so an
    // unscoped match stays green with the End-quiz cancel deleted — which is
    // the whole double-finish path.
    const endQuiz = code.slice(code.indexOf('const handleEndQuiz'), code.indexOf('const finishTest'))
    expect(endQuiz, 'End-quiz does not cancel the pending feedback pause')
      .toMatch(/clearTimeout\(feedbackTimer\.current\)/)
    expect(code, 'finishTest has no once-per-attempt latch')
      .toMatch(/if \(finishing\.current\) return/)
    expect(code, 'the latch is never released, so a retake cannot finish')
      .toMatch(/finishing\.current = false/)
  })

  it('does not re-count the question the learner just answered', () => {
    // `index` only advances inside the feedback timer, so while an answer is on
    // screen the current question is already in `answers` and, if wrong, in
    // `wrongVocab`. Slicing from `index` counted it twice — and for a word
    // answered CORRECTLY that is a fabricated wrong observation: with the
    // new-card fallback it creates a card and writes a grade-0 review log for a
    // word the learner got right.
    expect(src()).toMatch(/questions\.slice\(answered \? index \+ 1 : index\)/)
  })
})
