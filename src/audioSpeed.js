// The flashcard's playback rates, and the two decisions about them.
//
// A card used to carry three audio controls: Replay, a turtle, and a speed
// chip. Two of the three meant "slower", which is why the row read as clutter
// on a device. The turtle is gone and the speed control owns the whole feature,
// so the rates it offers had to become the ones a learner actually wants.
//
// Pure, so both decisions are testable without an <audio> element
// (CLAUDE.md §3) — useStudyAudio owns the element and the persistence.

// 1x → 0.75x → 1.25x, and back.
//
// 0.5x is retired with the turtle: half speed smears the tones of a synthesized
// clip, which is the opposite of what a learner slows a word down FOR. The
// genuinely slow reading was always the separately synthesized `word_slow`
// clip, never a dragged-out one.
export const SPEEDS = [1, 0.75, 1.25]

export function nextSpeed(current) {
  const i = SPEEDS.indexOf(current)
  // A rate that is no longer offered (a saved 0.5) has no "next" — start over
  // rather than returning undefined and leaving the element at a rate nothing
  // in the UI can name.
  if (i === -1) return SPEEDS[0]
  return SPEEDS[(i + 1) % SPEEDS.length]
}

export function seedSpeed(saved) {
  if (SPEEDS.indexOf(saved) !== -1) return saved
  // Someone who chose half speed wanted slow. Snapping them to 1x would
  // silently undo a preference; 0.75 is the nearest surviving answer.
  if (saved === 0.5) return 0.75
  return SPEEDS[0]
}
