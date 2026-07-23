// Pure helpers for grammar spaced-practice drills. No React, no Supabase, no
// side effects — all the fiddly bits live here so GrammarPractice.jsx stays a
// thin renderer and the logic is unit-tested.
//
// The authored drill items themselves live in grammarDrills.js, keyed by
// language + topic id. A single item is:
//   { sentence, blank, reading, en, options }
// where `sentence` contains the blank marker '__', `blank` ∈ `options`, and
// `options` are confusable grammar tokens.

export const BLANK_MARK = '__'

// Split a drill sentence into { before, after } around the first blank marker,
// for rendering the sentence with the blank in the middle. No regex (OXC-safe) —
// a plain indexOf/slice. If there's no marker, everything is `before`.
export function buildBlankParts(sentence) {
  const s = sentence || ''
  const at = s.indexOf(BLANK_MARK)
  if (at === -1) return { before: s, after: '' }
  return { before: s.slice(0, at), after: s.slice(at + BLANK_MARK.length) }
}

// Deterministically pick one of a topic's drill items. `seed` (e.g. the review
// row's reps count) rotates the choice so repeated reviews of the same topic
// don't always show the identical sentence. Returns null if there are none.
export function pickDrillItem(items, seed = 0) {
  if (!Array.isArray(items) || items.length === 0) return null
  const i = ((seed % items.length) + items.length) % items.length
  return items[i]
}

// Map a binary drill outcome to an FSRS grade (see src/srs.js). A fill-in-the-
// blank is self-grading: correct → Good (2), wrong → Again (0). There is no
// Hard/Easy for grammar review.
export function gradeFor(correct) {
  return correct ? 2 : 0
}

// Validate a single drill item's shape. Returned as a list of problems (empty =
// valid) so a test can report exactly what's wrong per item.
export function drillItemProblems(item) {
  const out = []
  if (!item || typeof item !== 'object') return ['not an object']
  if (typeof item.sentence !== 'string' || item.sentence.indexOf(BLANK_MARK) === -1) {
    out.push('sentence must contain the "__" blank marker')
  }
  if (!Array.isArray(item.options) || item.options.length < 2) {
    out.push('options must have at least 2 entries')
  } else {
    if (item.options.indexOf(item.blank) === -1) out.push('blank must be one of options')
    if (new Set(item.options).size !== item.options.length) out.push('options must be unique')
  }
  return out
}
