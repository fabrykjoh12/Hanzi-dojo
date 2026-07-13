// Pure session-tally decisions for one graded card, lifted out of Study.jsx's
// applyGrade. This module makes NO mutations and has NO side effects: it takes
// the grade + the card's previous/next state + its vocab, and returns the
// deltas to add to the session recap counters plus the chat-mission word
// metadata. Study.jsx still owns the refs and applies these deltas itself, so
// scheduling, XP, streaks, Supabase writes, and queue behavior are untouched.
//
// Terminology mirrors the recap tally exactly (graded / newLearned / again /
// graduated / reviewedTotal / reviewedRight). No new buckets are invented.

// computeStudyTally({ grade, previousState, nextState, vocab }) →
//   {
//     tally: { graded, newLearned, again, graduated, reviewedTotal, reviewedRight },
//     sessionWord: { word, weak, review } | null,
//   }
//
// - graded:        always 1 (one card was graded)
// - newLearned:    1 when the card was a new card
// - again:         1 when graded Again (grade 0)
// - graduated:     1 when the card moves into review state for the first time
// - reviewedTotal: 1 when the card was already a review card
// - reviewedRight: 1 when a review card was recalled (grade >= 1)
// - sessionWord:   the word touched this session (weak if graded Again; review
//                  if it was already a mature/review card), or null when the
//                  card has no usable vocab word.
export function computeStudyTally({ grade, previousState, nextState, vocab }) {
  const wasNew = previousState === 'new'
  const wasReview = previousState === 'review'

  const tally = {
    graded: 1,
    newLearned: wasNew ? 1 : 0,
    again: grade === 0 ? 1 : 0,
    graduated: nextState === 'review' && previousState !== 'review' ? 1 : 0,
    reviewedTotal: wasReview ? 1 : 0,
    reviewedRight: wasReview && grade >= 1 ? 1 : 0,
  }

  const sessionWord = vocab && vocab.word
    ? { word: vocab.word, weak: grade === 0, review: wasReview }
    : null

  return { tally, sessionWord }
}
