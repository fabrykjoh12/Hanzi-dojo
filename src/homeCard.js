// What Home's one card says. Pure, so every state is specified and tested
// here rather than branched inside the component.
//
// Home is a painting with one object resting in it: today's cards, and how
// far they carry you toward the next level. The whole card is the button, so
// the copy has to name the action's result without a button label: a count
// that reads as a sentence ("23 cards to review"), how long it takes, and the
// level progress underneath. Sentence case, no eyebrow labels, no dot-joined
// meta strings — see docs/DESIGN-BIBLE.md §5 and §14.

import { homeQueueSummary, homeProgressPct } from './homePresentation'
import { GENTLE_REVIEW_CAP } from './gentleReturn'

// The three queue colours, the owner's choice and the long-standing flashcard
// convention: blue for new, red for learning, green for review. Status
// colours stay hardcoded (CLAUDE.md §5); the component lifts them with ink()
// wherever they are text, so they hold contrast at night.
export const QUEUE_COLORS = Object.freeze({ new: '#2F6AB0', learning: '#B83A24', review: '#2F7A4D' })

// "5 of 44 words to HSK 3". A level with no words (the top of the scale, or
// counts that never arrived) has nothing honest to say, so it says nothing.
export function progressLine({ learned = 0, totalWords = 0, nextLevelLabel = '' } = {}) {
  if (!totalWords || totalWords <= 0) return ''
  const to = nextLevelLabel ? ' to ' + nextLevelLabel : ''
  return learned + ' of ' + totalWords + ' word' + (totalWords === 1 ? '' : 's') + to
}

// The whole card's content and behaviour for one state.
//   state  — 'ready' | 'clear' | 'failed'
//   go     — where a tap goes: 'study' or 'stories'
//   title  — the card's one strong line
//   detail — the quiet line under it ('' when there is nothing to add)
export function homeCard({ counts, learned = 0, totalWords = 0, nextLevelLabel = '', returning = false } = {}) {
  // null as well as undefined: callers hand state through that starts as null.
  counts = counts || {}
  const queue = homeQueueSummary(counts)
  const progress = progressLine({ learned, totalWords, nextLevelLabel })
  const pct = homeProgressPct(learned, totalWords)

  if (queue.failed) {
    return {
      state: 'failed', go: 'study', progress, pct,
      title: 'Cards didn’t load',
      detail: 'Try again',
      ariaLabel: 'Try again. Today’s cards didn’t load; starting a session loads them fresh.',
    }
  }

  if (queue.clear) {
    const tomorrow = counts.dueTomorrow || 0
    return {
      state: 'clear', go: 'stories', progress, pct,
      title: 'All caught up',
      detail: tomorrow > 0
        ? tomorrow + ' card' + (tomorrow === 1 ? '' : 's') + ' tomorrow. Read a story until then.'
        : 'Read a story.',
      ariaLabel: 'Read a story. All caught up for today.',
    }
  }

  // After a break the session serves a calm handful of the overdue reviews
  // (sessionPrep's gentle-return cap), so the card promises that handful, not
  // the whole backlog, and says the rest will come back gradually.
  const capped = returning && (counts.dueCount || 0) > GENTLE_REVIEW_CAP
  const n = capped ? queue.totalReady - (counts.dueCount || 0) + GENTLE_REVIEW_CAP : queue.totalReady
  const title = n + ' card' + (n === 1 ? '' : 's') + ' to review'
  // The owner chose the three counts over a time estimate, so the detail line
  // only speaks when there is something to explain (the gentle-return cap).
  const detail = capped ? 'Welcome back. The rest return over the next few days.' : ''
  // What today's session is made of, in session order. Review includes the
  // calibration checks (they ride in the review pool — see sessionPrep.js),
  // and after a break it shows the capped handful, so the three always add up
  // to the title.
  const reviewCount = (capped ? GENTLE_REVIEW_CAP : (counts.dueCount || 0)) + (counts.calibrationCount || 0)
  const breakdown = [
    { key: 'new', label: 'New', value: counts.newCount || 0 },
    { key: 'learning', label: 'Learning', value: counts.learnCount || 0 },
    { key: 'review', label: 'Review', value: reviewCount },
  ]
  const parts = breakdown.map(b => b.value + ' ' + b.label.toLowerCase()).join(', ')
  return {
    state: 'ready', go: 'study', progress, pct,
    title, detail, breakdown,
    ariaLabel: 'Start reviewing. ' + title + ': ' + parts + '.' + (detail ? ' ' + detail : '') + (progress ? ' ' + progress + '.' : ''),
  }
}
