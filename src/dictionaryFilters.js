// Dictionary status filters — let the learner narrow the dictionary to words in
// a given state (in their deck, still learning, mastered, or not started yet).
// Pure and unit-tested; the Dictionary screen maps each vocab row to a status
// (via its own statusOf) and calls filterVocab. Additive: a set of filter chips
// above the existing list, no change to search or lookup behavior.

// `status` values match Dictionary.statusOf: 'not_started' | 'learning' |
// 'mastered' | 'review'. ("review" = a graduated card that isn't mastered yet.)
export const DICT_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'in_deck', label: 'In deck' },
  { key: 'learning', label: 'Learning' },
  { key: 'mastered', label: 'Mastered' },
  { key: 'not_started', label: 'Not started' },
]

export function matchesDictFilter(status, filterKey) {
  switch (filterKey) {
    case 'all': return true
    case 'in_deck': return status !== 'not_started'
    case 'learning': return status === 'learning'
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
  mastered: 'No mastered words yet — they’ll appear here as your reviews prove they’ve stuck.',
  not_started: 'You’ve started every word here — nice work.',
}

export function dictionaryEmptyState(filterKey, hasQuery) {
  if (hasQuery) return null
  return EMPTY_COPY[filterKey] || 'No words here yet.'
}
