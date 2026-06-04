// SM-2 spaced repetition algorithm
// grade: 0 = Again, 1 = Hard, 2 = Good, 3 = Easy

export function calcNextReview(card, grade) {
  let interval = card.interval || 1
  let easeFactor = card.ease_factor || 2.5
  let repetitions = card.repetitions || 0

  if (grade < 2) {
    // Failed — reset
    repetitions = 0
    interval = 1
  } else {
    if (repetitions === 0) interval = 1
    else if (repetitions === 1) interval = 6
    else interval = Math.round(interval * easeFactor)
    repetitions += 1
  }

  // Adjust ease factor
  const delta = grade === 3 ? 0.15 : grade === 2 ? 0 : grade === 1 ? -0.15 : -0.2
  easeFactor = Math.max(1.3, easeFactor + delta)

  const nextReview = new Date(Date.now() + interval * 86400000).toISOString()

  return {
    interval,
    ease_factor: easeFactor,
    repetitions,
    next_review: nextReview,
    is_easy: grade === 3,
    learned: repetitions >= 2,
  }
}