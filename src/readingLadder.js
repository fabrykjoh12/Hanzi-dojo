// Reading Ladder — a calm visual of the reading path: the story tiers as rungs,
// which you've unlocked, where you are now, and how many words to the next rung.
// Pure and side-effect-free so it's easy to test; the Stories screen renders it
// from the same learnedCount + tier definitions it already uses to gate stories.

// Returns one entry per tier (ascending by minWords):
//   { tier, label, minWords, unlocked, isCurrent, wordsToUnlock }
// `isCurrent` marks the highest tier you've reached. `wordsToUnlock` is 0 for
// unlocked tiers, else how many more learned words that rung needs.
export function readingLadder(learnedCount, categories) {
  const cats = [...(categories || [])].sort((a, b) => a.minWords - b.minWords)
  const lc = Math.max(0, learnedCount || 0)
  let currentTier = null
  for (const c of cats) if (lc >= c.minWords) currentTier = c.tier
  return cats.map(c => ({
    tier: c.tier,
    label: c.label,
    minWords: c.minWords,
    unlocked: lc >= c.minWords,
    isCurrent: c.tier === currentTier,
    wordsToUnlock: lc >= c.minWords ? 0 : Math.max(0, c.minWords - lc),
  }))
}

// The next locked rung and how many words away it is, or null when the top rung
// is already reached. Drives a one-line "N more words to reach <label>" caption.
export function nextRung(learnedCount, categories) {
  const rungs = readingLadder(learnedCount, categories)
  const next = rungs.find(r => !r.unlocked)
  return next ? { label: next.label, wordsToGo: next.wordsToUnlock } : null
}
