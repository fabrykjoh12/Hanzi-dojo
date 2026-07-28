import { isWordlikeToken } from './storyReading'
import { glossaryLookup } from './grammarGlossary'

// What decoration does a story token get? One decision, four readers.
//
// The classic, paged, scene and chat readers all paint the same page of text in
// four slightly different ways, and each of them used to answer this question
// inline. That drift is how a word ended up boxed in one reader and bare in
// another — so the answer lives here, is pure, and is tested.
//
// Kinds:
//   'new'      — vocabulary in the level's list the learner hasn't started
//   'learning' — vocabulary in progress
//   'unknown'  — word-like, but NOT in the vocabulary pool and not a name or a
//                grammar particle: a word outside the syllabus entirely
//   null       — nothing to mark: a learned word, a name, punctuation, glue
//
// 'unknown' is the one the learner never had a cue for. A story is allowed to
// reach for a vivid word beyond the list, and until now those words looked
// exactly like words the learner was supposed to know — silently. Marking them
// says "this one isn't on your list", which is a different message from "this
// one is next to learn", so it gets a different mark (see UNKNOWN_MARK).
//
// The readers do NOT know at render time whether CC-CEDICT can resolve a token,
// and they must not: that answer costs a round trip per word. "Not in the pool
// and not a name/particle" is what the segmenter already knows, and it is the
// honest definition of an unknown word anyway — a dictionary miss is still a
// word the learner doesn't have.
export function tokenMarkKind(token, { status = 'not_started', language = null } = {}) {
  if (!token) return null
  if (token.vocab) {
    if (status === 'not_started') return 'new'
    if (status === 'learning') return 'learning'
    return null                                  // review / mastered → learned
  }
  // A character's name is a name, not a hole in the vocabulary list. It already
  // reads as a proper noun (green) in every reader.
  if (token.name) return null
  if (!isWordlikeToken(token.text)) return null   // punctuation and spacing
  // Particles, the copula, conjugation fragments: legitimately not vocabulary,
  // and the lookup explains them from the grammar glossary rather than the
  // dictionary. Marking every one of them would turn a page into confetti.
  if (glossaryLookup(language, token.text)) return null
  return 'unknown'
}

// Convenience for the readers' plain-token branch, which has already decided the
// token carries no vocabulary.
export function isUnknownToken(token, language) {
  return tokenMarkKind(token, { language }) === 'unknown'
}

// The out-of-list mark.
//
// Deliberately NOT the accent: the accent means "new vocabulary — learn this
// next", and an out-of-list word is the opposite message. It is drawn from the
// text's own ink (`currentColor`) instead of a fixed grey, which is what keeps
// it legible in light mode, in dark mode, and inside the chat reader's
// light-on-any-theme bubbles, without any of them passing a palette in. Dashed
// where the new-word mark is dotted/solid, so the two are tellable apart
// without relying on color alone; the wash stays under 8% so a paragraph with
// several of them still reads as a paragraph.
export const UNKNOWN_MARK = {
  background: 'color-mix(in srgb, currentColor 5%, transparent)',
  borderBottom: '1.5px dashed color-mix(in srgb, currentColor 50%, transparent)',
}

// The mark as the readers apply it: `null` when the token gets nothing, so a
// caller can spread it unconditionally.
//
// The Learning Lens (classic reader) quiets what you know and spotlights the
// frontier — it owns the vocabulary marks only. An out-of-list word is neither
// known nor next, so the Lens neither boxes it nor fades it: it keeps exactly
// this one mark, on or off, and stays identifiable either way.
export function unknownMarkStyle(token, language) {
  return isUnknownToken(token, language) ? UNKNOWN_MARK : null
}
