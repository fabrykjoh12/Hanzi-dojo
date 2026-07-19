// Filter the grammar guide's topics by a search query, so a learner can jump to
// "comparisons" or "了" instead of scrolling a long accordion. Pure and
// unit-tested. Reuses the diacritic-folding from searchFold so toneless pinyin
// ("le", "bi") matches tone-marked patterns too.

import { foldForSearch } from './searchFold'

// The searchable text for one topic: its title, blurb, pattern chip, and the
// plain-language point text (where the pattern's keywords live).
export function topicHaystack(topic) {
  if (!topic) return ''
  const parts = [topic.title, topic.blurb, topic.pattern]
  for (const p of (topic.points || [])) {
    if (p && p.text) parts.push(p.text)
  }
  return parts.filter(Boolean).join(' ')
}

// Returns the topics matching `query` (all of them when the query is blank).
export function filterTopics(topics, query) {
  const list = Array.isArray(topics) ? topics : []
  const q = foldForSearch((query || '').trim())
  if (!q) return list
  return list.filter(t => foldForSearch(topicHaystack(t)).includes(q))
}
