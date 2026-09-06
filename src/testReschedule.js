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
// WHY STAMPING VERIFICATION IS NOT A PRODUCT CHOICE HERE. It might look like
// one — "should a wrong answer end the claim?" — but the constraint settles it.
// A claim may hold scheduler state only once it stops being a claim. There is
// no legal write that reschedules a claimed card and leaves it claimed. So the
// only question left is whether the observation counts at all, and it plainly
// does: the learner was asked, in the app, and answered wrong.
//
// That is the same event calibration already models as "didn't know", through
// the same scheduler and the same grade, which is why this reuses
// calibrationUpdates rather than restating its shape.

import { schedule } from './srs'
import { calibrationUpdates } from './calibration'
import { isPriorKnown } from './knowledgeState'

// Again. The claim, or the card, is refuted — the word becomes an ordinary
// learning card, exactly as if it had been met for the first time.
export const TEST_WRONG_GRADE = 0

// testWrongAnswerWrite(card, options?) → the payload for gradeCardWrite.
//
// Pure: it builds the write, it does not perform it. `options` is forwarded to
// the scheduler (targetRetention, and the `now` test seam).
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
export function testResultSummaryLine({ passed, wrongCount, rescheduleFailed } = {}) {
  if (passed) return 'All correct. Your next level is now unlocking.'
  const words = wrongCount === 1 ? '1 wrong word' : wrongCount + ' wrong words'
  if (rescheduleFailed) {
    return words + ' could not be returned to review just now. They stay as they were — '
      + 'take the test again when you are back online. You need 100% to pass.'
  }
  return words + ' have been returned to review. You need 100% to pass.'
}
