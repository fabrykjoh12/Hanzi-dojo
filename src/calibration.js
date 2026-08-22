// Calibration — turning a claim into evidence, without inventing any.
//
// A prior-knowledge claim is inert: it has no scheduler state, it is never due,
// and it is never offered as a new card (its row already exists, so the word is
// suppressed from the new-card queue). That makes calibration REQUIRED rather
// than optional — it is the only path by which a claimed word can ever be
// observed. Ship it with the model, never after.
//
// A calibration check is simply the word's FIRST REAL REVIEW. It runs through
// the one canonical scheduler, on a card that ts-fsrs builds fresh:
// srs.buildFsrsCard returns createEmptyCard() for any row in state 'new', so
// there is no seeded stability to inherit and no back-dated last_review. What
// comes out is reps = 1, a real stability, a real last_review and a real review
// log — one genuine observation, and nothing more.
//
// Deliberately NOT done here (decision 4): no second FSRS configuration. An
// `enable_short_term: false` scheduler would let "I knew it" graduate straight
// to review without a same-session repeat, but it would also mean two
// schedulers to reason about and test. There is one.

import { schedule } from './srs'
import { isPriorKnown } from './knowledgeState'

// The check is binary. A claim is a yes/no question — "did you actually know
// this?" — and asking for a four-way self-assessment of a word the learner has
// never studied here invites noise, not signal.
//
// Mapped onto the canonical grades:
//   knew it  → Easy. The honest reading of instant, confident recall, and the
//              only grade that graduates a fresh card straight to review.
//   didn't   → Again. The claim is refuted and the word becomes an ordinary
//              learning card, exactly as if it had been met for the first time.
export const CALIBRATION_GRADE = { KNEW: 3, DIDNT_KNOW: 0 }

// How many checks one session may serve. The claim's own spread (see
// priorKnowledge.spreadDueDates) already paces the long run; this is the guard
// against a wall after a long absence, in the spirit of the gentle-return cap.
export const CALIBRATION_SESSION_CAP = 20

// Is this claim ready to be checked? The spread wrote a calibration-ready date
// into due_at — inert to every queue, because a 'new' card is never due — and
// this is the only place that reads it.
export function isCalibrationReady(card, now = new Date()) {
  if (!isPriorKnown(card)) return false
  if (!card.due_at) return true
  const endOfDay = new Date(now)
  endOfDay.setHours(23, 59, 59, 999)
  return new Date(card.due_at) <= endOfDay
}

// Frequency order: the words the learner meets most are checked first, because
// a wrong claim about a common word is the most expensive one to leave standing.
// `level` then `sort_order` is the same order the deck introduces vocabulary in;
// vocab_id breaks ties so the pick is stable across sessions.
function frequencyRank(a, b) {
  const av = a.vocab || {}
  const bv = b.vocab || {}
  const al = av.level == null ? Infinity : av.level
  const bl = bv.level == null ? Infinity : bv.level
  if (al !== bl) return al - bl
  const as = av.sort_order == null ? 0 : av.sort_order
  const bs = bv.sort_order == null ? 0 : bv.sort_order
  if (as !== bs) return as - bs
  return String(a.vocab_id) < String(b.vocab_id) ? -1 : 1
}

// pickCalibrationChecks(deck, { now, cap }) → the claims to check this session,
// most-frequent first. Pure: the caller supplies cards already joined to vocab.
export function pickCalibrationChecks(deck, { now = new Date(), cap = CALIBRATION_SESSION_CAP } = {}) {
  const limit = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : 0
  if (!limit) return []
  return (deck || [])
    .filter(c => c && c.vocab && isCalibrationReady(c, now))
    .sort(frequencyRank)
    .slice(0, limit)
}

// How many claims are still waiting, ready or not — for an honest "N words left
// to check" line, and for knowing when calibration is finished.
export function pendingCalibrationCount(deck) {
  return (deck || []).filter(isPriorKnown).length
}

// calibrationUpdates(card, knew, options) → the same { updates, stay, gap } the
// study screen already knows how to apply, plus verified_at.
//
// Everything in `updates` comes from the canonical scheduler. The only field
// added here is verified_at, which records WHEN the claim stopped being a claim;
// it is redundant against reps >= 1 and exists so "claimed, still unproven"
// stays a single indexed predicate for the calibration queue.
export function calibrationUpdates(card, knew, options) {
  const grade = knew ? CALIBRATION_GRADE.KNEW : CALIBRATION_GRADE.DIDNT_KNOW
  const res = schedule(card, grade, options)
  return {
    ...res,
    grade,
    updates: {
      ...res.updates,
      verified_at: new Date().toISOString(),
    },
  }
}
