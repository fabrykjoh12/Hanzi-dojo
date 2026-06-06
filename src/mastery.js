// A word is "mastered" when FSRS stability reaches this many days.
// Stability = predicted days until recall drops to ~90%.
export const MASTERY_STABILITY_DAYS = 21

// The level test unlocks when this fraction of the level's active words are mastered.
export const TEST_UNLOCK_MASTERY_PCT = 0.9

// A word is "learned" once it has graduated out of the initial learning phase at least once.
// The `learned` DB column is set true when a card first reaches review/relearning state.
export function isLearned(card) {
  if (!card) return false
  return Boolean(card.learned) || card.state === 'review' || card.state === 'relearning'
}

// A word is "mastered" when the FSRS algorithm predicts the user will still recall it
// roughly 3 weeks out — real, time-proven retention that cannot be faked by button clicks.
export function isMastered(card) {
  if (!card) return false
  return (card.stability || 0) >= MASTERY_STABILITY_DAYS
}

// Given an array of card rows scoped to the current level and the total active vocab count,
// returns { learnedCount, masteredCount, total, masteredPct }.
export function countMastery(cards, totalActiveWords) {
  const learnedCount = cards.filter(isLearned).length
  const masteredCount = cards.filter(isMastered).length
  const total = totalActiveWords
  const masteredPct = total > 0 ? masteredCount / total : 0
  return { learnedCount, masteredCount, total, masteredPct }
}
