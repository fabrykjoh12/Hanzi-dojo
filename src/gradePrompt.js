import { GRADES } from './grades'

// What to ask a learner about the card in front of them.
//
// "How well did you remember it?" is the wrong question for a word they are
// meeting for the first time — there is nothing to remember yet. Found on a
// first real run through the onboarding tutorial, where all three cards are new
// by definition, but it was never only an onboarding problem: the real study
// screen asks the same question of every new card in every session.
//
// So the question follows the card's state. The four grades do not change and
// neither does anything they do — this is what the buttons SAY, never what they
// mean. Again is still 0, Easy is still 3, and `schedule()` never sees any of
// this.
//
// New vs review is `cardMarker(card).key`, deliberately: that is already the
// app's single answer to "has this learner seen this word before", and it
// counts learning and relearning cards as reviews — a word you failed
// yesterday is not new to you.

const PROMPTS = {
  new: {
    prompt: 'How familiar was this word?',
    // Aligned with GRADES: Again, Hard, Good, Easy.
    glosses: ['New to me', 'Barely knew it', 'Knew it', 'Already knew it'],
  },
  review: {
    prompt: 'How well did you remember it?',
    glosses: ['Forgot', 'Barely', 'Remembered', 'Effortless'],
  },
}

// `markerKey` is cardMarker(card).key — 'new' for a first meeting, 'due' for
// everything else. Anything unrecognised is treated as a review: asking someone
// how well they remembered a word they have seen before is a mild mismatch,
// while asking a beginner to remember a word they have never met is nonsense.
export function gradePrompt(markerKey) {
  return markerKey === 'new' ? PROMPTS.new : PROMPTS.review
}

// The prompt alone — the study screen's footer line, which has no room for
// glosses and no need of them (its buttons carry the real schedule preview).
export function gradePromptText(markerKey) {
  return gradePrompt(markerKey).prompt
}

// The one-word meanings, shown by the onboarding tutorial on the first revealed
// card and nowhere else. One per grade, in the grade row's own order.
export function gradeGlosses(markerKey) {
  return gradePrompt(markerKey).glosses
}

export const GRADE_COUNT = GRADES.length
