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
import { sessionEstimateMinutes } from './sessionEstimate'
import { GENTLE_REVIEW_CAP } from './gentleReturn'

// "About 12 minutes" — never "~12 min" (abbreviated chrome) and never a
// precise-sounding number for a one-minute session.
export function minutesLine(minutes) {
  if (!minutes || minutes <= 0) return ''
  if (minutes === 1) return 'About a minute'
  return 'About ' + minutes + ' minutes'
}

// "5 of 44 words to HSK 3". A level with no words (the top of the scale, or
// counts that never arrived) has nothing honest to say, so it says nothing.
export function progressLine({ learned = 0, totalWords = 0, nextLevelLabel = '' } = {}) {
  if (!totalWords || totalWords <= 0) return ''
  const to = nextLevelLabel ? ' to ' + nextLevelLabel : ''
  return learned + ' of ' + totalWords + ' words' + to
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
      title: 'Today’s cards didn’t load',
      detail: 'Tap to try again',
      ariaLabel: 'Start reviewing. Today’s cards didn’t load; starting will try again.',
    }
  }

  if (queue.clear) {
    const tomorrow = counts.dueTomorrow || 0
    return {
      state: 'clear', go: 'stories', progress, pct,
      title: 'All caught up',
      detail: tomorrow > 0
        ? tomorrow + ' card' + (tomorrow === 1 ? '' : 's') + ' tomorrow. Read a story while you wait.'
        : 'Read a story while you wait.',
      ariaLabel: 'Read a story. All caught up for today.',
    }
  }

  // After a break the session serves a calm handful of the overdue reviews
  // (sessionPrep's gentle-return cap), so the card promises that handful, not
  // the whole backlog, and says the rest will come back gradually.
  const capped = returning && (counts.dueCount || 0) > GENTLE_REVIEW_CAP
  const n = capped ? queue.totalReady - (counts.dueCount || 0) + GENTLE_REVIEW_CAP : queue.totalReady
  const minutes = sessionEstimateMinutes(capped ? { ...counts, dueCount: GENTLE_REVIEW_CAP } : counts)
  const title = n + ' card' + (n === 1 ? '' : 's') + ' to review'
  const detail = capped
    ? 'Welcome back. The rest return over the next few days.'
    : minutesLine(minutes)
  return {
    state: 'ready', go: 'study', progress, pct,
    title, detail,
    ariaLabel: 'Start reviewing. ' + title + (detail ? '. ' + detail : '') + (progress ? '. ' + progress : ''),
  }
}
