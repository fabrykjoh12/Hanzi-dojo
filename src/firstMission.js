// What survives of the First Mission.
//
// The First Mission used to be a whole system: a welcome screen, a promise
// about five words, and a set of coaching hints keyed to how many cards had
// been graded — "This is a flashcard. Tap it to reveal the answer." on card 1,
// the speaker on card 3, typing on card 4.
//
// All of that is now taught by the sandbox tutorial, before the account exists,
// on the real card (Tutorial.jsx). Teaching it a second time inside the
// learner's first REAL session would be the tutorial-on-tutorial problem, and
// the hints were keyed to a card index, so changing the first-run card count or
// the card order would have silently pointed them at nothing.
//
// Two things remain, and both earn their place by happening somewhere the
// tutorial cannot reach — inside the learner's first real story:

// One calm line in the reader the first time a learner arrives from a session.
// No popup, no step; it names what the highlighting means and then gets out of
// the way.
export const FIRST_MISSION_READER_HINT = 'The highlighted words are the ones you just learned.'

// The encouraging line at the end of that first story.
export function firstMissionCompletion(languageName) {
  return `You’ve already read your first ${languageName || ''} story.`.replace('  ', ' ')
}

// NOT here, deliberately: the five-card cap on a first session. That lives in
// firstRun.js, is derived from the account's own card count, and survives
// reloads — it is the good half of this system and is untouched.
