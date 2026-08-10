// What a resume makes wrong.
//
// NAV-MODEL §3.5, and the last piece of the Home data lifecycle. Every other
// invalidation in the app answers to something that HAPPENED — a card graded, a
// chapter unlocked — and those are all covered by cacheEvents.js. Time is the
// one thing that changes data with nobody to publish an event about it: cards
// fall due while the phone is in a pocket, and at local midnight the day's
// reviews, the new-card allowance and today's reward claim all roll over.
//
// So the rule is emphatically NOT "refetch on resume". A resume is a moment to
// ASK the question, not an answer to it:
//
//   crossed local midnight  → the day rolled over. Counts and the story
//                             hand-off are both dated (the reward claim is
//                             keyed on today's date, and the daily story pick
//                             is seeded from it).
//   backgrounded a while    → cards have fallen due. Counts only.
//   back in a few seconds   → nothing. Alt-tabbing must cost nothing.
//
// And never the shelf. Published stories do not change because a phone was
// locked, so `stories:` is deliberately outside this file's reach — putting it
// in would mean every glance at another app cost a shelf reload.

import { HOME_COUNTS_STALE_MS } from './homeData'
import { HOME_COUNTS, HOME_HANDOFF } from './cacheEvents'

export { HOME_COUNTS_STALE_MS }

function dayKey(ms) {
  const d = new Date(ms)
  return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate()
}

// Returns the keys to invalidate and why, so the caller — and the specs — can
// see the decision rather than infer it from what got refetched.
export function resumeInvalidations({ backgroundedAt, resumedAt, staleMs = HOME_COUNTS_STALE_MS } = {}) {
  // No recorded hide: the first activation of the run, or a resume we never saw
  // the matching background for. Nothing is known to be stale, and guessing
  // "refetch" here is how "resume" quietly becomes "reload".
  if (!backgroundedAt || !resumedAt) return { keys: [], reason: 'none' }

  if (dayKey(resumedAt) !== dayKey(backgroundedAt)) {
    return { keys: [HOME_COUNTS, HOME_HANDOFF], reason: 'midnight' }
  }
  if (resumedAt - backgroundedAt >= staleMs) {
    return { keys: [HOME_COUNTS], reason: 'stale' }
  }
  return { keys: [], reason: 'none' }
}
