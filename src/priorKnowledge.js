// Prior knowledge — pure and testable.
//
// A "claim" is a set of vocab ids the learner says they already know, from a
// placement tier, a pasted word list, or the browsable checklist. This module
// turns a claim into INERT prior-knowledge rows (see knowledgeState.js) whose
// calibration dates are spread over the coming days, so the claim is checked a
// few words at a time instead of arriving as one wall.
//
// What changed, and why: a claim used to be written as a finished FSRS review
// card — state 'review', stability exactly at the mastery threshold, learned
// true, reps 0. That asserted three weeks of proven recall on the strength of
// one tap, and was indistinguishable in the database from a word the learner
// had genuinely studied. A claim now carries no scheduler state at all; the
// first real graded review is what creates it.
//
// Nothing here talks to the network — see priorKnowledgeSeed.js for the write.

import { priorKnownCardRow } from './knowledgeState'

const DAY_MS = 24 * 60 * 60 * 1000

// How fast the claimed words come back to be checked. The learner picks one of
// these at claim time; the number is nothing more than the calibration spread.
export const PACING = [
  { key: 'relaxed', label: 'Relaxed', perDay: 8 },
  { key: 'steady', label: 'Steady', perDay: 15 },
  { key: 'fast', label: 'Fast', perDay: 30 },
]

// How many days a claim of `count` words takes to check at `perDay` a day.
export function estimateDays(count, perDay) {
  if (!count || !perDay || perDay <= 0) return 0
  return Math.ceil(count / perDay)
}

// spreadDueDates(ids, perDay, now) → [{ vocabId, dayOffset, dueAt }]
//
// `ids` MUST already be in frequency order — this preserves the order it is
// given and never sorts, because only the caller knows which levels are in play
// (they get the ordering from `order('sort_order')` on the vocabulary query).
// The first `perDay` ids land on day 0 (today), so the first check-ups appear in
// the learner's very next session.
//
// The dates it produces are CALIBRATION-ready dates, not due dates: they land
// in due_at on a row whose state is 'new', which isCardDue() never reports as
// due. They steer the calibration queue and nothing else.
export function spreadDueDates(ids, perDay, now = Date.now()) {
  if (!ids || !ids.length || !perDay || perDay <= 0) return []
  return ids.map((vocabId, i) => {
    const dayOffset = Math.floor(i / perDay)
    return {
      vocabId,
      dayOffset,
      dueAt: new Date(now + dayOffset * DAY_MS).toISOString(),
    }
  })
}

// seedCardRows(userId, spread, now, source) → inert rows ready to upsert.
//
// Every FSRS field is absent rather than zero-with-meaning, so the claim cannot
// be read as evidence by any predicate, filtered or not. The database enforces
// the same shape through cards_unverified_claim_is_inert.
export function seedCardRows(userId, spread, now = Date.now(), source = 'placement') {
  return (spread || []).map(entry =>
    priorKnownCardRow(userId, entry.vocabId, source, now, entry.dueAt))
}
