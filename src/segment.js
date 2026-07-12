// Word-tile tokenization shared by the Sentence Builder drill and the grammar
// guide's "Try it" reorder exercise. Splits a sentence into content words
// (punctuation dropped) so they can be scrambled into tappable tiles.

export const PUNCT = '、。，．！？；：「」『』（）()【】…—~～·,.!?;:\'"-– '

// A token counts as content if it has at least one non-punctuation character.
export function isContent(t) {
  const s = (t || '').trim()
  if (!s) return false
  for (let i = 0; i < s.length; i += 1) {
    if (PUNCT.indexOf(s[i]) === -1) return true
  }
  return false
}

// Locale-aware word segmenter, or null where Intl.Segmenter is unavailable.
export function makeSegmenter(locale) {
  try {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) return new Intl.Segmenter(locale, { granularity: 'word' })
  } catch { /* unsupported */ }
  return null
}

// Split a sentence into content word tokens using the segmenter (falling back
// to per-character, which is fine for Chinese and rough for Japanese).
export function tokenize(sentence, segmenter) {
  const out = []
  if (segmenter) {
    for (const seg of segmenter.segment(sentence)) {
      if (isContent(seg.segment)) out.push(seg.segment)
    }
  } else {
    for (let i = 0; i < (sentence || '').length; i += 1) {
      if (isContent(sentence[i])) out.push(sentence[i])
    }
  }
  return out
}

// Deterministic-enough scramble that guarantees a different order than sorted
// (so a tile set is never presented already-solved).
export function scrambleIndices(n, shuffle) {
  const ids = []
  for (let i = 0; i < n; i += 1) ids.push(i)
  let s = shuffle(ids)
  for (let tries = 0; tries < 6 && s.every((id, i) => id === i); tries += 1) s = shuffle(ids)
  return s
}
