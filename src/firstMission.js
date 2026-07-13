// First Mission — the interactive first-run experience. ALL tutorial copy lives
// here (one place), and the per-card hint decision is a pure, tested function.
// The flow itself reuses the real product: the guided study session is the
// normal Study screen (first-run detection in firstRun.js caps it to 5 words),
// the transition is SessionRecap's Story Unlock, and the reading is the normal
// story reader via the existing deep-link. Nothing about the learning loop is
// duplicated — this module only supplies words to say and when to say them.

export const FIRST_MISSION_WELCOME = {
  title: 'Welcome to Hanzi Dojo',
  body: [
    'You’ll learn your first 5 words.',
    'Then you’ll use them in a real story.',
  ],
  cta: 'Start First Mission',
}

// Shown in the reader when arriving from the first mission — one calm line, no
// popups, then the user just reads.
export const FIRST_MISSION_READER_HINT = 'The highlighted words are the ones you just learned.'

// The encouraging line added to the end-of-story recap on the first mission.
export function firstMissionCompletion(languageName) {
  return `You’ve already read your first ${languageName || ''} story.`.replace('  ', ' ')
}

// Progressive-disclosure coaching hints for the guided first session. `index`
// is the number of cards graded so far (0 = the very first card). One concept
// at a time; most cards get nothing. The first card is context-aware (flip →
// grade), and the typing hint only appears when typed recall is actually on.
//
// Returns a short string, or null for "no hint — behave normally". The hint for
// a step naturally disappears as `index` advances to the next card.
const CARD_HINTS = {
  0: { front: 'This is a flashcard. Tap it to reveal the answer.', back: 'Did you remember it? Tap Good.' },
  2: { text: 'Tap the speaker to hear it pronounced.' },
  3: { text: 'Type what you hear, then check your answer.', typedOnly: true },
}

export function firstMissionCardHint(index, { flipped = false, isTyped = false } = {}) {
  const h = CARD_HINTS[index]
  if (!h) return null
  if (h.typedOnly && !isTyped) return null
  if (h.front || h.back) return flipped ? h.back : h.front
  return h.text
}
