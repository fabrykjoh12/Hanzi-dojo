// Known-Word Map — a calm view of how much of the language you can already read,
// bucketed by level, so progress is visible as your vocabulary grows. Pure and
// unit-tested; the Profile screen feeds it the active vocab (id + level) and a
// map of the learner's cards, and renders the buckets as stacked bars.
//
// A word falls into exactly one bucket:
//   mastered — FSRS predicts recall ~3 weeks out (isMastered)
//   known    — graduated out of learning at least once (isLearned), not yet mastered
//   learning — a card exists but hasn't graduated
//   new      — no card yet (unseen)
// "Readable" = mastered + known.

import { isLearned, isMastered } from './mastery'

export const MAP_BUCKETS = ['mastered', 'known', 'learning', 'new']

export function wordStatus(card) {
  if (!card) return 'new'
  if (isMastered(card)) return 'mastered'
  if (isLearned(card)) return 'known'
  return 'learning'
}

function emptyRow(level) {
  return { level, total: 0, mastered: 0, known: 0, learning: 0, new: 0, readable: 0 }
}

// vocab: array of { id, level }. cardById: map vocab_id -> card row (or falsy).
// Returns { levels: [row…] (ascending), totals: row-without-level }.
export function knownWordMap(vocab, cardById) {
  const cards = cardById || {}
  const byLevel = new Map()

  for (const v of Array.isArray(vocab) ? vocab : []) {
    if (!v || v.level == null || v.id == null) continue
    if (!byLevel.has(v.level)) byLevel.set(v.level, emptyRow(v.level))
    const row = byLevel.get(v.level)
    row.total += 1
    row[wordStatus(cards[v.id])] += 1
  }

  const levels = [...byLevel.values()].sort((a, b) => a.level - b.level)
  for (const row of levels) row.readable = row.mastered + row.known

  const totals = levels.reduce((t, r) => {
    t.total += r.total; t.mastered += r.mastered; t.known += r.known
    t.learning += r.learning; t.new += r.new
    return t
  }, { total: 0, mastered: 0, known: 0, learning: 0, new: 0 })
  totals.readable = totals.mastered + totals.known

  return { levels, totals }
}

// A calm one-line summary, e.g. "You can read 42 of 150 words so far."
export function readableSummary(map) {
  const t = (map && map.totals) || { readable: 0, total: 0 }
  if (t.total === 0) return 'Your reading map fills in as you learn your first words.'
  return `You can read ${t.readable} of ${t.total} words so far.`
}

// A screen-reader label for one level's stacked bar — the numbers a sighted user
// reads off the colored segments, as text. `levelLabel` is the display label
// (e.g. "HSK 2"), passed in so this stays pure.
export function rowA11yLabel(row, levelLabel) {
  const r = row || { readable: 0, total: 0, mastered: 0, known: 0, learning: 0, new: 0 }
  const label = levelLabel || 'Level'
  return `${label}: ${r.readable} of ${r.total} words readable — `
    + `${r.mastered} mastered, ${r.known} known, ${r.learning} learning, ${r.new} not started`
}
