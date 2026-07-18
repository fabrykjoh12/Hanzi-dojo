// Pure scoring for the end-of-story comprehension quiz. `answers` is a map of
// questionId -> chosen option index. Returns how many are answered and how many
// of those are correct. Kept in its own module (not the component file) so it's
// unit-tested without a DOM and shared by the classic + new readers.
export function scoreComprehension(questions, answers) {
  let answered = 0, correct = 0
  for (const q of (questions || [])) {
    const chosen = answers ? answers[q.id] : undefined
    if (chosen === undefined) continue
    answered += 1
    if (chosen === q.correct_index) correct += 1
  }
  return { answered, correct, total: (questions || []).length }
}
