// Pure presentation model for the Home screen.
//
// Home is the restored "one lit block" layout: a header line, the flashcard
// queue as the single hero, a quiet "Then read" hand-off, and one combined
// week/progress panel. This module turns raw counts and fetched rows into
// exactly what the screen prints, so the JSX stays layout-only and every
// visible string has a test.

import { homeQueueSummary } from './homePresentation'
import { rhythmSummary } from './studyRhythm'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// The header's compact context line, e.g. "HSK 1 · Saturday".
export function homeHeaderMeta(levelLabel, now = new Date()) {
  return levelLabel + ' · ' + DAYS[now.getDay()]
}

// The screen's one action. Cards while there are cards; once the queue is
// clear the next step in the daily loop is reading. When the counts failed to
// load, the zeros are meaningless — keep the button on Study, which loads its
// own queue and so doubles as the retry.
export function homeAction(counts = {}) {
  const queue = homeQueueSummary(counts)
  return queue.failed || !queue.clear
    ? { label: 'Start reviewing', go: 'study' }
    : { label: 'Read a story', go: 'stories' }
}

// The hero's headline: eyebrow, the big number (or the ✓ once clear), and
// what the number means. The failed shape carries its own honest copy — every
// count would be a meaningless zero, so no number is shown at all.
export function queueHeadline(counts = {}) {
  const queue = homeQueueSummary(counts)
  if (queue.failed) {
    return { eyebrow: 'Today’s cards', failed: true, value: '', caption: 'Couldn’t load today’s queue' }
  }
  if (queue.clear) {
    return { eyebrow: 'Queue clear', failed: false, value: '✓', caption: 'all caught up' }
  }
  return {
    eyebrow: 'Ready to review',
    failed: false,
    value: String(queue.totalReady),
    caption: 'card' + (queue.totalReady === 1 ? '' : 's') + ' waiting',
  }
}

// The queue's composition, in session order. "Review" (not "Due") — the label
// names what the learner does with the cards, matching Study's own voice.
export function queueBreakdown(counts = {}) {
  return [
    { label: 'New', value: counts.newCount || 0 },
    { label: 'Learning', value: counts.learnCount || 0 },
    { label: 'Review', value: counts.dueCount || 0 },
  ]
}

// An honest accessible name for the hero, so a screen reader hears the action
// and the state instead of every string inside the panel.
export function heroAriaLabel({ counts = {} } = {}) {
  const queue = homeQueueSummary(counts)
  if (queue.failed) return 'Start reviewing — the queue couldn’t load, starting will retry'
  if (queue.clear) return 'Read a story — all caught up'
  return 'Start reviewing — ' + queue.totalReady
    + ' card' + (queue.totalReady === 1 ? '' : 's') + ' waiting'
}

// Status line for the "Then read" hand-off — the story's locked/unlocked
// state in the product's calm, observational voice.
export function storyStatus({ stage, daily } = {}) {
  if (stage === 'cards') return 'Finish cards to unlock'
  if (daily === undefined) return 'Finding today’s story'
  if (stage === 'story') return 'Ready to read'
  if (stage === 'caught-up') return 'Caught up'
  return 'Story complete'
}

// The hand-off's context line under the story's title: its level, and the
// product's whole promise — how much of it the learner can already read.
// "HSK 1 · 92% readable" is that promise in four words, so it stays compact.
export function storyHandoffSub({ levelLabel = '', knownPct = null } = {}) {
  const parts = []
  if (levelLabel) parts.push(levelLabel)
  if (typeof knownPct === 'number' && knownPct > 0) parts.push(knownPct + '% readable')
  return parts.join(' · ')
}

// The week panel's summary line. Observational copy only — no streaks, nothing
// to protect or lose.
export function weekLine(rhythm) {
  const { studiedDays, days } = rhythmSummary(rhythm || [])
  if (studiedDays === 0) return 'No sessions yet'
  return 'Studied ' + studiedDays + ' of the last ' + days + ' days'
}

// Tomorrow's load in one phrase — shared by the hero's done state and the
// week panel's outlook, so the number speaks with one voice (docs/METRICS.md).
export function tomorrowLine(dueTomorrow = 0) {
  return dueTomorrow > 0
    ? 'About ' + dueTomorrow + ' waiting tomorrow'
    : 'Nothing due tomorrow — a free day'
}

// One quiet line for what's ahead — the return hook that doesn't depend on
// guilt: tomorrow's load, plus the week's average when there is one.
export function aheadLine({ dueTomorrow = 0, forecastTotal = 0, perDay = 0 } = {}) {
  const tomorrow = tomorrowLine(dueTomorrow)
  return forecastTotal > 0 ? tomorrow + ' · ~' + perDay + '/day this week' : tomorrow
}
