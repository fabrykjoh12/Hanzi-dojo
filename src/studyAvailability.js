// What a study session will actually serve today — one definition, used by
// both the Home counts and the Study queue.
//
// Home and Study each used to spell these filters out for themselves. The
// predicates matched (both call `isCardDue`, so day-based availability was
// never in question) but the DECK they ran over did not:
//
//   Study  — every card in the track. A card exists because the learner chose
//            to study that word; saving one from a story or the dictionary is
//            a deliberate act, so it belongs in the session even when the word
//            sits above the current level or carries no level at all.
//   Home   — only cards whose word falls inside the current level window.
//
// So a learner who had saved words off-level saw a Home count smaller than the
// session they then got: measured on production, 62 review cards were due and
// invisible on Home across 4 accounts. Home is the promise, Study is the
// delivery, and they have to be the same number.
//
// Scope, stated once (docs/METRICS.md asks every number to name it): these run
// over the DECK — every card started in the active track, every level. The
// level-window scope still belongs to level progress (learned / mastered /
// totalWords), which is a different question and keeps its own scope.
//
// New cards are deliberately NOT here. They are introduced only from the
// current level window, so their count is level-scoped by design and is
// derived from vocabulary rather than from cards.

import { isCardDue } from './srs'

// Lapsed at least twice and not yet mastered — the cleanup-drill pool.
const WEAK_MIN_LAPSES = 2
const WEAK_MAX_STABILITY = 21

// Time-sensitive re-tries: learning and relearning cards scheduled for today.
export function dueLearningCards(deck, now) {
  return (deck || []).filter(c => (c.state === 'learning' || c.state === 'relearning') && isCardDue(c, now))
}

// The backbone of a session: review cards scheduled for today. Day-based, so
// every review for today is served from the local 00:00 rollover.
export function dueReviewCards(deck, now) {
  return (deck || []).filter(c => c.state === 'review' && isCardDue(c, now))
}

// Cards the learner keeps lapsing on. Not due-gated — the weak drill is
// deliberately available regardless of schedule.
export function weakCards(deck) {
  return (deck || []).filter(c => (c.lapses || 0) >= WEAK_MIN_LAPSES && (c.stability || 0) < WEAK_MAX_STABILITY)
}
