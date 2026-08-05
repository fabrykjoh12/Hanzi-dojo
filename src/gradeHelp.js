// Copy explaining the four SRS grades — what each one means and what pressing
// it does to the card's schedule. One place, so the button tooltips and the
// "how grading works" panel can never drift apart.
//
// Tone rules (CLAUDE.md §1): observational, no guilt. "Again" is information
// the scheduler needs, never a failure — the copy has to carry that.

export const GRADE_HELP = [
  {
    grade: 0,
    label: 'Again',
    tip: "Couldn't recall it. The card starts over and comes back later in this session — pressing Again is how the app finds the right pace, nothing is lost.",
  },
  {
    grade: 1,
    label: 'Hard',
    tip: 'Recalled it, but slowly or with real effort. The next wait grows less than usual.',
  },
  {
    grade: 2,
    label: 'Good',
    tip: 'Recalled it with normal effort. The usual choice — the wait grows at the standard rate.',
  },
  {
    grade: 3,
    label: 'Easy',
    tip: 'Instant, effortless recall. The next wait grows extra long.',
  },
]

// Shared footer for the explainer panel — ties the copy to the interval shown
// under each button.
export const GRADE_HELP_FOOTER =
  'The time under each button is roughly when the card will come back. Be honest rather than generous — the schedule only works when the grade matches what actually happened.'

// Tooltip text for one grade button (hover on desktop; the "?" panel carries
// the same copy for touch).
export function gradeTip(grade) {
  const entry = GRADE_HELP.find(g => g.grade === grade)
  return entry ? entry.tip : ''
}
