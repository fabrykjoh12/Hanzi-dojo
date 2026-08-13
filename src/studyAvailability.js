// What is ready to study right now — ONE derivation, for every screen.
//
// P14-5D exists because there were two. On a device, Home said "74 reviews
// ready" while the Cards tab served 136, and both were computed correctly by
// their own rules:
//
//   1. **Scope.** Home filtered its cards to the level window (the vocabulary
//      between the study floor and the current level) and threw the rest away.
//      Study includes EVERY card on the track — a word saved from the dictionary
//      or from a story above your level is a card you chose to own, and it goes
//      in the session. So every such card was invisible to Home.
//   2. **Composition.** Home's headline counted reviews and learning only, with
//      new cards as a footnote. The session serves reviews AND new, so its number
//      was always the larger one.
//   3. **The gentle-return cap.** After a 3-day break Study caps the overdue
//      backlog at GENTLE_REVIEW_CAP (20) — which is why the same account can show
//      "20 cards" one day and 136 the next, with nothing else having changed.
//      Home never applied the cap, so it advertised work the session would not
//      serve.
//
// Three honest rules, three different numbers, no bug in any single file. That is
// what a missing shared derivation looks like, so here it is: pure, tested, and
// consumed by both the counts (homeCounts.js) and the queue (Study.jsx).
//
// ── The rules, stated once ────────────────────────────────────────────────
//
//   · **Eligibility is the whole track.** Not the level window. A card exists
//     because the learner chose that word.
//   · **New cards are window-scoped**, because introducing a word is a
//     curriculum decision — you are given the next words at your level, never a
//     word from three levels up. Capped by what is left of today's allowance.
//   · **The cap is part of availability.** What a screen advertises must be what
//     the session will actually serve; the uncapped backlog is reported
//     separately so the UI can be honest about the rest without promising it.
//
// Pure module: no React, no Supabase, no clock of its own beyond the `now` the
// caller passes.

import { isCardDue } from './srs'
import { gentleReviewTarget } from './gentleReturn'

// A learning/relearning card is mid-drill; a review card is on the schedule.
function isLearning(card) {
  return card.state === 'learning' || card.state === 'relearning'
}

export function studyAvailability({
  cards = [],
  // The vocabulary ids inside the level window — used ONLY to decide what may be
  // introduced as new, never to decide what is due.
  windowVocabIds = null,
  // How many window words have no card yet. The caller knows the vocabulary; this
  // module refuses to guess it from the cards.
  unstartedInWindow = 0,
  dailyNewCards = 0,
  introducedToday = 0,
  returning = false,
  now = new Date(),
} = {}) {
  const all = Array.isArray(cards) ? cards : []

  const learning = all.filter(c => isLearning(c) && isCardDue(c, now))
  // Day-based availability (srs.js): everything scheduled for today is served
  // from local midnight, not from the clock time it was last reviewed.
  const reviewsAll = all.filter(c => c.state === 'review' && isCardDue(c, now))

  // The cap, applied oldest-due first so the most overdue cards clear first —
  // the same order Study queues them in, so the count and the session agree card
  // for card and not just in total.
  const target = gentleReviewTarget({ returning, dueReviewCount: reviewsAll.length })
  const reviews = target < reviewsAll.length
    ? [...reviewsAll].sort((a, b) => new Date(a.due_at) - new Date(b.due_at)).slice(0, target)
    : reviewsAll

  const remainingNew = Math.max(0, (dailyNewCards || 0) - (introducedToday || 0))
  const newAvailable = Math.min(Math.max(0, unstartedInWindow), remainingNew)

  // When nothing is due, the next thing a learner might want to know is when
  // something will be. Null when they have no scheduled reviews at all.
  let nextReviewAt = null
  for (const c of all) {
    if (c.state !== 'review' || isCardDue(c, now)) continue
    if (!c.due_at) continue
    if (!nextReviewAt || new Date(c.due_at) < new Date(nextReviewAt)) nextReviewAt = c.due_at
  }

  return {
    // The card rows themselves, so Study builds its queue from the same objects
    // this counted — the only way the two can never drift again.
    learning,
    reviews,
    reviewsAll,

    counts: {
      learningDue: learning.length,
      reviewsDue: reviews.length,
      // What the cap is holding back. Not shown as work; shown, if at all, as
      // "the rest come back over the next days".
      reviewsDeferred: reviewsAll.length - reviews.length,
      newAvailable,
      // THE number a screen should lead with: what this session will serve.
      totalReady: learning.length + reviews.length + newAvailable,
      cappedByReturn: reviews.length < reviewsAll.length,
      nextReviewAt,
      // Informational, and deliberately not part of `totalReady`: window scoping
      // belongs to new cards only.
      windowScoped: windowVocabIds ? true : false,
    },
  }
}

// The phrase Home puts under its count. Composed here so the count and the
// breakdown can never describe different things.
export function availabilityBreakdown(counts) {
  if (!counts) return []
  const parts = []
  const reviews = (counts.reviewsDue || 0) + (counts.learningDue || 0)
  if (reviews > 0) parts.push(reviews + ' review' + (reviews === 1 ? '' : 's'))
  if (counts.newAvailable > 0) parts.push(counts.newAvailable + ' new')
  return parts
}
