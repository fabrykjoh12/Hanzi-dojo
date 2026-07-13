// Pure token/status helpers for the immersion reader, extracted so they can be
// unit-tested. Kept separate from storyMatch.js (the recap's greedy-scan
// readability) on purpose: the reader classifies against its Intl.Segmenter
// parse and needs the four-way status below to drive its per-word coloring +
// status dot, whereas the recap collapses to known/learning/new. Sharing one
// function would change one of the two production behaviors, so only the pieces
// that are genuinely identical live here.

// A vocab card → its reading status, moved verbatim from the reader.
//   not_started — no card yet (unknown / new)
//   mastered    — card.is_easy
//   review      — reached the review state
//   learning    — started but not yet review
export function wordStatus(vocabId, userCards) {
  const card = userCards[vocabId]
  if (!card) return 'not_started'
  if (card.is_easy) return 'mastered'
  if (card.state === 'review') return 'review'
  return 'learning'
}

// The distinct story words the learner studied today: the intersection of the
// story's vocabulary words with today's studied words. Order follows the story
// word list; duplicates are dropped.
export function todayWordsInStory(storyWords, todayWords) {
  const today = new Set(todayWords || [])
  const seen = new Set()
  const out = []
  ;(storyWords || []).forEach(w => {
    if (today.has(w) && !seen.has(w)) { seen.add(w); out.push(w) }
  })
  return out
}
