// Pure presentation model for the Home screen — the "Desk" design.
//
// Home holds the learner's current real task object: before cards, the actual
// first flashcard of the prepared session; after cards, tonight's actual
// story; after that, practice. This module turns raw counts and fetched rows
// into exactly what the screen prints, so the JSX stays layout-only and every
// visible string and sizing rule has a test.

import { homeQueueSummary } from './homePresentation'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December']

// The date line in the top bar, e.g. "Sunday, August 16".
export function homeDateEyebrow(now = new Date()) {
  return DAYS[now.getDay()] + ', ' + MONTHS[now.getMonth()] + ' ' + now.getDate()
}

// Display size for the desk card's word, by character count — one line,
// centered, never clipped; the same word at study size is only a step larger,
// which is what lets the tap transition read as the same object growing.
export function deskWordSize(word = '') {
  const len = [...String(word)].length
  if (len <= 2) return 76
  if (len === 3) return 60
  if (len === 4) return 48
  return 38
}

// The state chip on the desk card — the same two labels the study card's
// marker uses (cardMarker.js: first-time vs. review, nothing else), so the
// object Home shows is labelled exactly the way Study will label it.
export function deskChipLabel(state) {
  return state === 'new' ? 'FIRST TIME' : 'REVIEW'
}

// The desk card's footer line: what the session contains, in one quiet string.
export function deskCardsSub({ counts = {}, estimate = '' } = {}) {
  const queue = homeQueueSummary(counts)
  if (queue.failed) return 'Queue unavailable — starting will retry'
  const parts = [
    queue.reviewCount + (queue.reviewCount === 1 ? ' review' : ' reviews'),
    queue.newCount + ' new',
  ]
  if (estimate) parts.push(estimate)
  return parts.join(' · ')
}

// Status line for the story step (rows and the story desk share it). Strings
// are the product's calm, observational voice — state the fact, never nag.
export function storyStatus({ stage, daily } = {}) {
  if (stage === 'cards') return 'Finish cards to unlock'
  if (daily === undefined) return 'Finding today’s story'
  if (stage === 'story') return 'Ready to read'
  if (stage === 'caught-up') return 'Caught up'
  return 'Story complete'
}

// Status line for the practice step.
export function practiceStatus(stage) {
  if (stage === 'practice') return 'Ready to practice'
  if (stage === 'complete') return 'Complete for today'
  if (stage === 'caught-up') return 'Nothing due'
  return 'After your story'
}

// The story object's eyebrow: level, plus how much of it the learner can
// already read when we know. "HSK 1 · 92% readable" is the product's whole
// promise in five words, so it earns the spot.
export function storyEyebrow({ levelLabel = '', knownPct = null } = {}) {
  if (!levelLabel) return ''
  if (typeof knownPct === 'number' && knownPct > 0) {
    return levelLabel + ' · ' + knownPct + '% readable'
  }
  return levelLabel
}
