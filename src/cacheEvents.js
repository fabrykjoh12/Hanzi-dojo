// What actually makes a cached screen wrong, and which keys it makes wrong.
//
// Before this table, invalidation was a prefix and a guess: Study finished a
// session and called `invalidate('home:')`, which is every Home key there will
// ever be, whether the session touched it or not. That works while there is one
// key per screen and stops working the moment there are three — grading a card
// would drag the profile and the story hand-off down with the counts.
//
// So the mapping is written down, in one place, as data:
//
//   - an event is something that HAPPENED (a card was graded, a chapter
//     unlocked), never a screen or a route. `shouldRefreshHome`'s "did we come
//     from a read-only view" was the route version of this question, and it
//     could only ever approximate the answer.
//   - a key appears under an event only if that event can change its VALUE.
//     Reading a story cannot change how many cards are due; grading a card
//     cannot change which chapter is next. Neither one gets to invalidate the
//     other.
//   - invalidating is cheap and refetching is not: `invalidate` only marks, so
//     the cost is paid once, later, by whichever screen is actually looked at.
//
// `language:switched` is deliberately absent. A language switch is not an
// invalidation — every key is namespaced by language (dataCache.js), so the new
// language reads a different namespace that is simply empty, and switching back
// finds the previous language's data still valid. Publishing an event for it
// would throw away data that is perfectly correct.

import { invalidate } from './dataCache'

// ── Keys ─────────────────────────────────────────────────────────────────
//
// Three for Home, along its real seams: who you are, what is due, and what to
// read next. They are separate because they go wrong for different reasons —
// grading a card must not cost a profile fetch, and reading a chapter must not
// cost a card fetch.
export const HOME_IDENTITY = 'home:identity'
export const HOME_COUNTS = 'home:counts'
export const HOME_HANDOFF = 'home:handoff'
// Stories' shelf, matched as a prefix (it owns `stories:shelf` today).
export const STORIES = 'stories:'

export const EVENT_KEYS = {
  // One card graded. The queue moved; nothing else did. Home is not on screen
  // while this fires, so the mark is free and the refetch happens once, when
  // the learner next looks at Home.
  'card:graded': [HOME_COUNTS],

  // A session finished: counts moved, a chapter may have been claimed, and the
  // shelf's unlocked state with it.
  'session:completed': [HOME_COUNTS, HOME_HANDOFF, STORIES],

  // A chapter was unlocked (the reward claim). Which chapter is next changes;
  // the card queue does not.
  'chapter:unlocked': [HOME_HANDOFF, STORIES],

  // A chapter was read. Changes what comes next and the shelf's progress. It
  // does NOT change the review queue — a read is not a review.
  'story:read': [HOME_HANDOFF, STORIES],

  // The level test passed: the track's level moves, which re-scopes the deck,
  // the counts, the reachable stories — everything.
  'level:unlocked': [HOME_IDENTITY, HOME_COUNTS, HOME_HANDOFF, STORIES],

  // A profile write. Counts are included because `daily_new_cards` is one of
  // their inputs: a learner who changes their daily goal in Settings must see
  // the new number on Home, not the one their old goal produced.
  'profile:updated': [HOME_IDENTITY, HOME_COUNTS],

  // The deck itself changed — a word added from the dictionary, or a reset.
  'words:changed': [HOME_COUNTS],
}

export function keysFor(event) {
  return EVENT_KEYS[event] || []
}

// Mark everything the event made wrong. Returns the keys it touched, so a
// caller (or a test) can see what it did rather than infer it.
export function publish(event) {
  const keys = keysFor(event)
  keys.forEach((key) => invalidate(key))
  return keys
}
