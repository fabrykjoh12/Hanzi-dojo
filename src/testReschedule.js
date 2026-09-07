// What a wrong answer on the level test does to the card.
//
// The level test asks the learner a word and they get it wrong. That is a real
// observation — the strongest kind the app has, because it is not self-graded —
// and it has to land in the card the same way any other observation does.
//
// THE DEFECT THIS EXISTS FOR. Test.jsx used to build `schedule(card, 0)` and
// write the result straight to `cards` with an ordinary UPDATE, ignoring the
// error. Two things were wrong with that, and the second one was silent.
//
//   1. It wrote `reps`, `stability` and `last_review` outside srs.schedule()'s
//      write path, with no `review_logs` row. CLAUDE.md §7.3b: `reps >= 1` is
//      the one fact meaning "a human graded this word inside Hanzi Dojo", and
//      `isLearned` / `isMastered` / the level-test gate all rest on it. In
//      production this left 61 cards with reps and no log at all, and 104 where
//      reps exceeds the log count.
//
//   2. On a PRIOR-KNOWLEDGE CLAIM the write did not happen at all. A claim is
//      inert by database constraint — `cards_unverified_claim_is_inert`, which
//      is applied in production — so a row with `prior_known_at` set and
//      `verified_at` null may not carry scheduler state. Setting `state`,
//      `reps`, `stability`, `difficulty` and `last_review` on one is exactly
//      what that constraint forbids, so Postgres rejected the UPDATE. Test.jsx
//      never read the error.
//
//      The result: the learner demonstrably did not know the word, the card was
//      not rescheduled, and the row stayed `prior_known` — so it kept counting
//      for reading and kept unlocking story tiers. Production holds 588
//      unverified claims, so this was reachable on a live account today.
//
// WHAT THE CONSTRAINT SETTLES, AND WHAT IT DOES NOT. A claim may hold scheduler
// state only once it stops being a claim, so there is no legal write that
// reschedules a claimed card and leaves it claimed. That rules out the obvious
// fix.
//
// It does NOT settle the whole question, and an earlier version of this comment
// claimed it did. A third option is legal: leave the row a claim and move
// `due_at`, which the constraint does not touch and which is already the
// calibration-ready date — putting the failed word at the front of the
// calibration queue without asserting a verification. That is a real
// alternative, and choosing against it is a product judgement, not an
// inevitability. The judgement: the learner was asked, in the app, and answered
// wrong. That is an observation, and the level test is a stronger signal than a
// self-report, so it should count as one.
//
// It is the same event calibration models as "didn't know", through the same
// scheduler and the same grade, which is why this reuses calibrationUpdates
// rather than restating its shape.
//
// BE PRECISE ABOUT WHAT THAT REUSE BUYS. calibrationUpdates' only addition over
// schedule() is a client-side `verified_at` — and grade_card does not read it.
// Its UPDATE takes a fixed 13-key whitelist from p_updates and computes
// verified_at from the SERVER clock (20260822170000), deliberately, so the
// device cannot steer it. So on every path where the RPC exists, the two
// produce identical rows, and the claim is resolved by the server.
//
// The client stamp is load-bearing only on the legacy fallback in syncQueue,
// reached when the RPC is absent entirely — which is exactly the pre-migration
// state 20260822170000 exists to fix. Keeping it costs nothing and covers that
// case; it is simply not what makes the common path work.

import { schedule } from './srs'
import { calibrationUpdates } from './calibration'
import { isPriorKnown } from './knowledgeState'

// The columns Test.jsx must SELECT for the branch below to work.
//
// Owned here rather than written inline at the query, because this module is
// what reads them and the two silently drifted: the SELECT omitted
// prior_known_at, so isPriorKnown() read undefined, was always false, and the
// claim branch never executed. The fix looked present and did nothing, and
// every spec that exercised it fabricated the missing column.
//
// verified_at rides along because isPriorKnown's companions read it, and
// interval_days because the review log's previous_interval_days is built from
// it — without it a mature card's history logged a 0-day previous interval.
export const TEST_CARD_COLUMNS = [
  'id', 'vocab_id', 'state', 'due_at', 'stability', 'difficulty',
  'elapsed_days', 'scheduled_days', 'reps', 'lapses', 'learning_step',
  'last_review', 'interval_days', 'prior_known_at', 'verified_at',
].join(', ')

// Again. The claim, or the card, is refuted — the word becomes an ordinary
// learning card, exactly as if it had been met for the first time.
export const TEST_WRONG_GRADE = 0

// The in-memory shape of a word the learner has no card for yet.
//
// THE LEVEL TEST CAN ASK ABOUT ONE. It unlocks at 90% coverage (testLogic.js),
// and generateQuestions draws from the whole level irrespective of cards — so
// up to a tenth of the words on the test have no row, and for a learner who
// reached the test by coverage rather than by studying everything, that
// unstudied tail is the LIKELIEST source of wrong answers.
//
// An earlier version of this module returned null for those and the screen
// counted them as "could not be returned to review just now — take the test
// again when you are back online". Nothing was offline, nothing had failed,
// retaking the test would produce the same outcome, and it would spend one of
// three daily attempts. That is the same defect this file exists to remove: a
// sentence about what the app did, printed without checking.
//
// So the word gets a card, which is what a wrong answer means. It is the same
// shape sessionPrep hands Study for a brand-new word, graded the same way
// through the same RPC — and grade_card's insert branch takes `on conflict
// (user_id, vocab_id) do update`, so a row appearing between the SELECT and
// the write is an update rather than a duplicate-key error.
export function newTestCard(vocabId) {
  return { id: null, vocab_id: vocabId, state: 'new', interval_days: 0, learning_step: 0 }
}

// testWrongAnswerWrite(card, options?) → the payload for gradeCardWrite.
//
// Pure: it builds the write, it does not perform it. `options` is forwarded to
// the scheduler — `{ targetRetention }`, which is the learner's retention dial.
//
// Returns null only for a card with no vocabulary id, which is not a word.
// `card.id` may be null: that is the new-card case above, and gradeCardWrite
// takes `cardId: null` for exactly it.
export function testWrongAnswerWrite(card, options) {
  if (!card || !card.vocab_id) return null

  // A claim refuted is a calibration "didn't know": same grade, same scheduler,
  // plus the verified_at that lets the row legally hold scheduler state at all.
  // An ordinary card just takes the grade.
  const res = isPriorKnown(card)
    ? calibrationUpdates(card, false, options)
    : schedule(card, TEST_WRONG_GRADE, options)

  return {
    cardId: card.id || null,
    vocabId: card.vocab_id,
    updates: res.updates,
    // The log is what makes reps honest. Without it `reps` climbs with nothing
    // behind it, which is the invariant §7.3b exists to protect.
    log: {
      grade: TEST_WRONG_GRADE,
      previous_state: card.state,
      next_state: res.updates.state,
      previous_interval_days: card.interval_days || 0,
      next_interval_days: res.updates.interval_days,
    },
  }
}


// The line the result screen shows under the score.
//
// Pure and tested here rather than a ternary in JSX, because it is a claim
// about what the app DID, and it used to be false. "N wrong words have been
// returned to review" was printed unconditionally — including when every one of
// those writes had just been rejected by the database and the error thrown
// away. The learner was told the words were coming back and they were not.
//
// Calm and observational, per the product's voice: it says what happened and
// what to do, with no guilt and no alarm.
// `rescheduled` short of `wrongCount` now means one thing only: a write, or the
// lookup before it, actually failed. It used to also mean "the learner has no
// card for that word", which made the retry sentence a lie — see newTestCard.
// Every wrong word is written now, so "did not come back" and "something went
// wrong" are the same statement again, and the copy can say so.
// `canRetry` is whether the screen will actually OFFER another attempt. Without
// it the failure sentence said "take the test again when you are back online"
// to a learner on their third attempt of the day — while the same screen hides
// both the attempts line and the Try-again button. Telling somebody to do a
// thing the app refuses to let them do is the same defect this module exists to
// remove, one sentence over.
export function testResultSummaryLine({ passed, wrongCount, rescheduled, canRetry = true } = {}) {
  if (passed) return 'All correct. Your next level is now unlocking.'

  const total = wrongCount || 0
  // Absent means the ordinary path where every write landed.
  const done = rescheduled == null ? total : rescheduled
  const words = (n) => (n === 1 ? '1 wrong word' : n + ' wrong words')
  const tail = ' You need 100% to pass.'

  if (done >= total) return words(total) + ' have been returned to review.' + tail
  // The advice, only where it is actionable. "Back online" is also the most
  // likely cause and not the only one — a refusal from the database reads the
  // same from here — so it says what the app knows (they stay as they were)
  // and offers the retry rather than diagnosing.
  const retry = canRetry ? ' Take the test again when you are back online.' : ''
  if (done === 0) {
    return words(total) + ' could not be returned to review just now. They stay as '
      + 'they were.' + retry + tail
  }
  // Partial. Saying "N returned" here would be false for the rest, and saying
  // "none returned" would be false for the ones that did.
  return done + ' of ' + total + ' wrong words have been returned to review. '
    + 'The rest stay as they were.' + retry + tail
}


// The tally the result line is built from.
//
// Here rather than in Test.jsx because it is the MEASUREMENT, and a claim
// printed without a measurement behind it is the whole defect this file exists
// for. It was counted inside a 1,500-line component with no spec on it, and the
// branch that was wrong was the untested one.
//
// `results` is one gradeCardWrite result per wrong word, in order.
export function tallyTestReschedules(results) {
  const rows = results || []
  let rescheduled = 0
  let firstError = null
  for (const r of rows) {
    if (r && r.ok) { rescheduled += 1; continue }
    if (!firstError && r && r.error) firstError = r.error
  }
  // firstError, not lastError: with several failures the first is the one that
  // explains the rest. The caller logs it to the device console — it is
  // deliberately not shown to the learner, since a Postgres message is not
  // something they can act on, but a failure with no trace anywhere is worse.
  return { rescheduled, attempted: rows.length, failed: rows.length - rescheduled, firstError }
}
