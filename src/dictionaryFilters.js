// Dictionary status filters — let the learner narrow the dictionary to words in
// a given state (in their deck, still learning, mastered, or not started yet).
// Pure and unit-tested; the Dictionary screen maps each vocab row to a status
// (via its own statusOf) and calls filterVocab. Additive: a set of filter chips
// above the existing list, no change to search or lookup behavior.

import { isMastered, isPriorKnown } from './knowledgeState'

// The status a card gets in the dictionary list: 'not_started' | 'learning' |
// 'mastered' | 'review'. ("review" = a graduated card that isn't mastered yet.)
//
// This used to live inline in Dictionary.jsx and read
// `card.is_easy || (card.stability || 0) >= 21`, which is wrong twice over:
// `is_easy` is a kept-but-dead flag that gates nothing (CLAUDE.md §4 — stability
// is the gate), so a word the learner had once pressed "Easy" on showed as
// Mastered under the filter even when FSRS said it had not stuck; and the 21 was
// a hardcoded copy of MASTERY_STABILITY_DAYS that would silently drift if the
// threshold ever moved. It now defers to mastery.js like the rest of the app.
export function cardStatus(card) {
  if (!card) return 'not_started'
  // A claim is in the deck — the learner told us they know it — but it is not
  // learning, and it is certainly not mastered.
  if (isPriorKnown(card)) return 'prior_known'
  if (card.state === 'learning' || card.state === 'relearning') return 'learning'
  if (isMastered(card)) return 'mastered'
  if (card.state === 'review') return 'review'
  return 'not_started'
}

export const DICT_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'in_deck', label: 'In deck' },
  { key: 'learning', label: 'Learning' },
  { key: 'prior_known', label: 'Previously known' },
  { key: 'mastered', label: 'Mastered' },
  { key: 'not_started', label: 'Not started' },
]

export function matchesDictFilter(status, filterKey) {
  switch (filterKey) {
    case 'all': return true
    case 'in_deck': return status !== 'not_started'
    case 'learning': return status === 'learning'
    case 'prior_known': return status === 'prior_known'
    case 'mastered': return status === 'mastered'
    case 'not_started': return status === 'not_started'
    default: return true
  }
}

// vocab: array of rows. statusFor: (row) => status string. Returns the rows
// whose status matches the filter. 'all' (or an unknown key) returns everything.
export function filterVocab(vocab, statusFor, filterKey) {
  const rows = Array.isArray(vocab) ? vocab : []
  if (!filterKey || filterKey === 'all') return rows
  return rows.filter(v => matchesDictFilter(statusFor(v), filterKey))
}

// Encouraging, filter-aware copy for an empty list. Returns null when a search
// query is active (the caller keeps its own "no match for <query>" message).
const EMPTY_COPY = {
  in_deck: 'Nothing in your deck here yet — open any word and add it to start.',
  learning: 'No words in learning right now. Ones you’re actively studying show up here.',
  prior_known: 'Nothing here you’ve told us you already knew. Words you import or tick off show up here until a review confirms them.',
  mastered: 'No mastered words yet — they’ll appear here as your reviews prove they’ve stuck.',
  not_started: 'You’ve started every word here — nice work.',
}

export function dictionaryEmptyState(filterKey, hasQuery) {
  if (hasQuery) return null
  return EMPTY_COPY[filterKey] || 'No words here yet.'
}

// The distinct levels present in a vocab list, ascending — powers the level
// filter's options so it only ever offers levels that actually exist.
export function levelsInVocab(vocab) {
  const set = new Set()
  for (const v of Array.isArray(vocab) ? vocab : []) {
    if (v && v.level != null) set.add(v.level)
  }
  return [...set].sort((a, b) => a - b)
}

// Keep only rows at `level` (a number). 'all' / null / undefined keeps everything.
export function filterByLevel(vocab, level) {
  const rows = Array.isArray(vocab) ? vocab : []
  if (level == null || level === 'all') return rows
  return rows.filter(v => v && v.level === level)
}

// True when a status or level filter is narrowing the list. The screen uses this
// to explain an empty search result: "no matches" while an invisible chip is
// silently hiding two thirds of the dictionary is the single most confusing
// thing this screen could say.
export function hasActiveFilters(filterKey, levelFilter) {
  const statusOn = Boolean(filterKey) && filterKey !== 'all'
  const levelOn = levelFilter != null && levelFilter !== 'all'
  return statusOn || levelOn
}
