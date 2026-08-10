// The four grades: their order, their names, and — the reason this file exists
// — a stable key for each.
//
// Everything inside the study loop speaks in NUMBERS, because that is what FSRS
// takes: 0 Again, 1 Hard, 2 Good, 3 Easy. That is fine there, where the number
// is passed straight to `schedule()`. It is not fine as a contract between two
// separate systems: if the row is ever reordered, a stored or replayed "2" that
// meant Good silently becomes something else.
//
// So anything OUTSIDE the scheduler — the onboarding tutorial, anything
// persisted, anything replayed — refers to a grade by its key. The key travels
// with the entry, so a reorder moves the whole row together and cannot swap a
// learner's Good for a Hard.
//
// Dependency-free on purpose: the pure tutorial state machine imports this, and
// it must not pull a palette (or React) in behind it.

export const GRADES = [
  { key: 'again', grade: 0, label: 'Again' },
  { key: 'hard', grade: 1, label: 'Hard' },
  { key: 'good', grade: 2, label: 'Good' },
  { key: 'easy', grade: 3, label: 'Easy' },
]

export const GRADE_KEYS = GRADES.map(g => g.key)

export function isGradeKey(key) {
  return typeof key === 'string' && GRADE_KEYS.indexOf(key) !== -1
}

// The key for a scheduler grade number, or null. Looked up in the table rather
// than indexed into it, so it stays correct if the order ever changes.
export function gradeKey(grade) {
  const found = GRADES.find(g => g.grade === grade)
  return found ? found.key : null
}

export function gradeLabel(key) {
  const found = GRADES.find(g => g.key === key)
  return found ? found.label : null
}
