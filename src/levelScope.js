import { hasGenuineObservation } from './knowledgeState'

// Cumulative level scope — pure and testable.
//
// A track's `current_level` is the highest level the user has unlocked. The
// study deck is CUMULATIVE: advancing a level never drops the words you already
// learned at earlier levels — they keep coming back for review. So the deck
// spans every level from a "floor" up to `current_level`.
//
// The floor is the lowest level the user actually studies. Two cases:
//   - A natural learner who started at level 1 has cards at level 1, so the
//     floor is 1 and the deck spans 1..current_level (fully cumulative).
//   - A learner who placed higher (onboarding tier / placement test) assumed
//     the lower levels as already-known and never studied them. Their lowest
//     card is at their start level, so the floor stays there and those assumed-
//     known levels are never introduced as new cards.
//
// Deriving the floor from the user's existing cards means no schema change and
// no extra "start level" column: the cards themselves record where studying
// began. Before any card exists (a brand-new placed learner), the floor is the
// current level, so the very first session studies exactly that level.

// The level of a card row, whether it carries the joined `vocabulary` object
// (server fetch) or a resolved `vocab` object (Study's in-memory mapping).
function cardLevel(card) {
  if (!card) return null
  if (card.vocabulary && card.vocabulary.level != null) return card.vocabulary.level
  if (card.vocab && card.vocab.level != null) return card.vocab.level
  return null
}

// studyFloorLevel(cards, currentLevel) → the lowest level in the cumulative deck.
//
// Only GENUINELY studied cards move the floor. A prior-knowledge claim is an
// assertion about the past, not a record of study, so it must not drag the
// floor down: a learner placed into HSK 3 who claimed HSK 1-2 has not started
// studying at HSK 1, and pulling the floor there would widen the session
// vocabulary window and re-scope Home's level-progress denominator to ~950
// words the learner never agreed to study. This is what the module's own note
// above always intended; before prior knowledge was distinguishable there was
// no way to express it.
export function studyFloorLevel(cards, currentLevel) {
  let floor = null
  for (const c of cards || []) {
    if (!hasGenuineObservation(c)) continue
    const lvl = cardLevel(c)
    if (lvl != null && (floor == null || lvl < floor)) floor = lvl
  }
  if (floor == null) return currentLevel
  return Math.min(floor, currentLevel)
}

// inCumulativeScope(level, floorLevel, currentLevel) → whether a level belongs
// to the cumulative deck [floor..current].
export function inCumulativeScope(level, floorLevel, currentLevel) {
  return level != null && level >= floorLevel && level <= currentLevel
}
