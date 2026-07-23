// Prior knowledge — pure and testable.
//
// A "claim" is a set of vocab ids the learner says they already know, from a
// placement tier, a pasted word list, or the browsable checklist. This module
// turns a claim into ordinary FSRS review cards whose due dates are spread over
// the coming days, so the claim is verified a few words at a time instead of
// dumping hundreds of reviews on the learner at once.
//
// Nothing here talks to the network — see priorKnowledgeSeed.js for the write.

import { MASTERY_STABILITY_DAYS } from './mastery'

const DAY_MS = 24 * 60 * 60 * 1000

// How fast the claimed words come back to be checked. The learner picks one of
// these at claim time; the number is nothing more than the due-date spread.
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

// seedCardRows(userId, spread, now) → rows ready to upsert into `cards`.
//
// Stability sits exactly at the mastery threshold, so a claimed word counts as
// known everywhere from day one. `scheduled_days` is the spread offset rather
// than the stability, which makes the first check-up an EARLY review relative to
// a 21-day stability — FSRS then grants less stability on success, which is the
// right conservative bias for a claim we have not verified yet.
export function seedCardRows(userId, spread, now = Date.now()) {
  const lastReview = new Date(now).toISOString()
  return (spread || []).map(entry => ({
    user_id: userId,
    vocab_id: entry.vocabId,
    state: 'review',
    learned: true,
    stability: MASTERY_STABILITY_DAYS,
    difficulty: 5,
    reps: 0,
    lapses: 0,
    // Never true outside the SRS grading flow (CLAUDE.md §13.3).
    is_easy: false,
    last_review: lastReview,
    scheduled_days: entry.dayOffset,
    elapsed_days: 0,
    due_at: entry.dueAt,
  }))
}
