// Which vocabulary rows the study deck still needs.
//
// Study loads vocabulary by LEVEL — floor..current_level — and then maps each of
// the learner's cards onto that list, dropping any card whose vocabulary it
// didn't load. That drop is silent, and two kinds of card fall through it:
//
//   · a word saved from the reference dictionary, whose vocabulary row carries
//     NO level at all (level IS NULL). A level range never matches NULL, so the
//     row is never loaded and the card vanishes from the queue.
//   · a word saved from a story that belongs to a HIGHER level than the learner
//     has reached. The stories screen loads every level's vocabulary so the
//     whole text is tappable, so tapping a reach word in an easy story creates
//     exactly this card.
//
// Both cases look identical to the learner: they tap save, the reader marks the
// word as started, and it never appears in a flashcard session again. The fix is
// this module — after the level-scoped load, ask which card vocabulary is still
// missing and fetch those rows by id.
//
// Kept pure and separate because it is the sort of thing that silently regresses:
// a spec here fails the moment the two halves of the deck disagree again.

// missingVocabIds(cards, vocabById) → ids to fetch, deduped, in first-seen order.
// `cards` is the raw card list (each with a vocab_id); `vocabById` is what the
// level-scoped load already resolved.
export function missingVocabIds(cards, vocabById = {}) {
  const out = []
  const seen = new Set()
  ;(cards || []).forEach(c => {
    const id = c && c.vocab_id
    if (!id) return
    if (vocabById[id]) return
    if (seen.has(id)) return
    seen.add(id)
    out.push(id)
  })
  return out
}

// mergeVocab(vocabById, rows) → a new map with `rows` added.
// Never overwrites a row the level-scoped load already has: that one is the
// canonical, ordered copy the new-card queue is built from.
export function mergeVocab(vocabById = {}, rows = []) {
  const next = { ...vocabById }
  ;(rows || []).forEach(v => { if (v && v.id && !next[v.id]) next[v.id] = v })
  return next
}
