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

// testWrongAnswerWrite(card, options?) → the payload for gradeCardWrite.
//
// Pure: it builds the write, it does not perform it. `options` is forwarded to
// the scheduler — `{ targetRetention }`, which is the learner's retention dial.
//
// Returns null for a card the caller does not have, so the loop that calls this
// has one shape rather than a guard at each site.
export function testWrongAnswerWrite(card, options) {
  if (!card || !card.id) return null

  // A claim refuted is a calibration "didn't know": same grade, same scheduler,
  // plus the verified_at that lets the row legally hold scheduler state at all.
  // An ordinary card just takes the grade.
  const res = isPriorKnown(card)
    ? calibrationUpdates(card, false, options)
    : schedule(card, TEST_WRONG_GRADE, options)

  return {
    cardId: card.id,
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
export function testResultSummaryLine({ passed, wrongCount, rescheduled } = {}) {
  if (passed) return 'All correct. Your next level is now unlocking.'

  const total = wrongCount || 0
  // Absent means the ordinary path where every write landed.
  const done = rescheduled == null ? total : rescheduled
  const words = (n) => (n === 1 ? '1 wrong word' : n + ' wrong words')
  const tail = ' You need 100% to pass.'

  if (done >= total) return words(total) + ' have been returned to review.' + tail
  if (done === 0) {
    return words(total) + ' could not be returned to review just now. They stay as '
      + 'they were — take the test again when you are back online.' + tail
  }
  // Partial. Saying "N returned" here would be false for the rest, and saying
  // "none returned" would be false for the ones that did.
  return done + ' of ' + total + ' wrong words have been returned to review. '
    + 'The rest stay as they were — take the test again when you are back online.' + tail
}
