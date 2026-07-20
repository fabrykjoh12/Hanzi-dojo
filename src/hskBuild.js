// Pure transforms for building HSK 3.0 curriculum word lists from the
// complete-hsk-vocabulary dataset (drkameleon/complete-hsk-vocabulary, MIT).
// The IO/DB wrapper is build-hsk-vocab.mjs; this module is unit-tested.
//
// Dataset entry shape (only the fields we use):
//   { simplified, level: ["new-4", ...], frequency,
//     forms: [{ transcriptions: { pinyin }, meanings: [..] }] }
// "new-N" is the HSK 3.0 (2021) band a word belongs to.

// A meanings array → a short curriculum gloss: the first two senses, trimmed.
// (CC-CEDICT-style dumps are long; a flashcard wants something scannable.)
export function cleanHskMeaning(meanings) {
  const list = (Array.isArray(meanings) ? meanings : []).map(m => (m || '').trim()).filter(Boolean)
  return list.slice(0, 2).join('; ')
}

// One dataset entry → a seed row { word, reading, meaning }, or null if it's
// missing any of the three (unusable for the curriculum).
export function hskEntryToRow(entry) {
  const word = (entry?.simplified || '').trim()
  const form = (entry?.forms || [])[0]
  const reading = (form?.transcriptions?.pinyin || '').trim()
  const meaning = cleanHskMeaning(form?.meanings)
  if (!word || !reading || !meaning) return null
  return { word, reading, meaning }
}

// The seed rows for one HSK 3.0 level (words tagged "new-<level>"), ordered by
// frequency (most common first — lower `frequency` = more common), capped at
// `cap`, excluding any word in `exclude` (words already in the deck at any level,
// so the same word never lands at two levels).
export function buildLevelRows(dataset, level, { cap = 500, exclude = new Set() } = {}) {
  const tag = 'new-' + level
  const picked = (Array.isArray(dataset) ? dataset : [])
    .filter(e => Array.isArray(e.level) && e.level.includes(tag))
    .sort((a, b) => (a.frequency ?? Infinity) - (b.frequency ?? Infinity))
  const rows = []
  const seen = new Set()
  for (const e of picked) {
    const row = hskEntryToRow(e)
    if (!row) continue
    if (exclude.has(row.word) || seen.has(row.word)) continue
    seen.add(row.word)
    rows.push(row)
    if (rows.length >= cap) break
  }
  return rows
}
