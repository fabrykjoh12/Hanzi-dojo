// Pure presentation model for TODAY — the KAIMEN screen.
//
// Today is a STATE, not a dashboard. It rests on the learner's current real
// object: the first card of the prepared session, then tonight's story, then
// practice, then a quiet done state. Nothing here is a widget about the work —
// each environment IS the work, and this module decides which one Today is in
// and every string it prints, so the JSX stays layout-only and the product's
// voice has tests.
//
// Numbers are only ever printed when they are genuinely known. A count we
// cannot source (patterns practised today, pages in a chapter) is left out
// rather than estimated — an app that invents a number once is never trusted
// with the next one.

import { homeQueueSummary } from './homePresentation'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December']

// The date on the chip that opens the overview, e.g. "Sunday, August 16".
export function todayDateLabel(now = new Date()) {
  return DAYS[now.getDay()] + ', ' + MONTHS[now.getMonth()] + ' ' + now.getDate()
}

// Display size for the resting card's word, by character count — one line,
// centred, never clipped. The same word at study size is only a step larger,
// which is what lets the tap read as one object growing rather than a new
// screen arriving.
export function todayWordSize(word = '') {
  const len = [...String(word)].length
  if (len <= 2) return 76
  if (len === 3) return 60
  if (len === 4) return 48
  return 38
}

// The story object's eyebrow: level, plus how much of it the learner can
// already read when we know. "HSK 1 · 67% readable" is the product's whole
// promise in five words, so it earns the spot.
export function storyEyebrow({ levelLabel = '', knownPct = null } = {}) {
  if (!levelLabel) return ''
  if (typeof knownPct === 'number' && knownPct > 0) {
    return levelLabel + ' · ' + knownPct + '% readable'
  }
  return levelLabel
}

// Which object Today is resting on. `homeDailyStage` already decides the
// learner's position in the daily loop; this maps that to the environment the
// screen renders, and exists so the mapping is named rather than a chain of
// ternaries inside JSX.
export function todayEnvironment(stage) {
  if (stage === 'cards') return 'cards'
  if (stage === 'story') return 'story'
  if (stage === 'practice') return 'practice'
  if (stage === 'complete') return 'done'
  return 'shelf'
}

// The chip on the resting card: where this card sits in today's session, and
// the same two state words Study's own marker uses (cardMarker.js), so the
// object Today shows is labelled exactly the way the session will label it.
// Falls back to the bare state while the prepared queue is still building —
// a position we don't know yet is never guessed.
export function todayCardChip({ total = 0, state } = {}) {
  const label = state === 'new' ? 'FIRST TIME' : 'REVIEW'
  if (!total || total < 1) return label
  return '1 OF ' + total + ' · ' + label
}

// The line under the resting card: what the session actually contains.
export function todayCardSub({ counts = {}, estimate = '' } = {}) {
  const queue = homeQueueSummary(counts)
  if (queue.failed) return 'Queue unavailable — starting will retry'
  const parts = [
    queue.reviewCount + (queue.reviewCount === 1 ? ' review' : ' reviews'),
    queue.newCount + ' new',
  ]
  if (estimate) parts.push(estimate)
  return parts.join(' · ')
}

// What the learner finished today. Only parts we can source: cards reviewed
// comes from the day's activity row, the story from today's read. Practice has
// no "done today" record, so it is never claimed.
export function todayDoneSummary({ studiedToday = 0, storyRead = false } = {}) {
  const parts = []
  if (studiedToday > 0) parts.push(studiedToday + (studiedToday === 1 ? ' card' : ' cards'))
  if (storyRead) parts.push('1 story')
  return parts.join(' · ')
}

// The quiet forward look on the done state. Observational, never a nudge:
// it states what is scheduled, and says nothing at all when nothing is.
export function todayTomorrowLine({ dueTomorrow = 0 } = {}) {
  if (!dueTomorrow || dueTomorrow < 1) return ''
  return 'Tomorrow — ' + dueTomorrow + (dueTomorrow === 1 ? ' review' : ' reviews') + ' due'
}

// Status word for each step in the overview sheet. The sheet is a utility: it
// reports state, it never sells the next action.
export function overviewStepStatus({ key, stage, daily } = {}) {
  if (key === 'cards') {
    if (stage === 'cards') return 'Up now'
    return 'Done'
  }
  if (key === 'story') {
    if (stage === 'cards') return 'After cards'
    if (daily === undefined) return 'Finding today’s story'
    if (daily === null) return 'Nothing new'
    if (stage === 'story') return 'Up now'
    return 'Read'
  }
  // practice
  if (stage === 'practice') return 'Up now'
  if (stage === 'complete') return 'Done'
  if (stage === 'caught-up') return 'Nothing due'
  return 'After your story'
}

// True for the step Today is currently resting on — the sheet marks it, so the
// learner can see at a glance what the screen behind the sheet is showing.
export function overviewStepIsCurrent({ key, stage } = {}) {
  if (key === 'cards') return stage === 'cards'
  if (key === 'story') return stage === 'story'
  return stage === 'practice'
}

// The three steps of the daily loop, as the sheet lists them.
export function overviewSteps({ stage, counts = {}, daily } = {}) {
  const queue = homeQueueSummary(counts)
  const grammarDue = counts.grammarDueCount || 0
  return [
    {
      key: 'cards',
      title: 'Cards',
      sub: stage === 'cards'
        ? todayCardSub({ counts })
        : 'Nothing due right now',
      status: overviewStepStatus({ key: 'cards', stage, daily }),
      current: overviewStepIsCurrent({ key: 'cards', stage }),
    },
    {
      key: 'story',
      title: 'Story',
      sub: '',
      status: overviewStepStatus({ key: 'story', stage, daily }),
      current: overviewStepIsCurrent({ key: 'story', stage }),
    },
    {
      key: 'practice',
      title: 'Grammar review',
      sub: grammarDue > 0
        ? grammarDue + (grammarDue === 1 ? ' pattern due' : ' patterns due')
        : '',
      status: overviewStepStatus({ key: 'practice', stage, daily }),
      current: overviewStepIsCurrent({ key: 'practice', stage }),
    },
  ].map(step => (step.key === 'cards' && queue.failed
    ? { ...step, sub: 'Queue unavailable — starting will retry' }
    : step))
}

// The level line in the overview's utility rows, e.g. "HSK 2 · 28 of 44 words".
export function overviewProgressLabel({ levelLabel = '', learned = 0, totalWords = 0 } = {}) {
  if (!levelLabel) return ''
  if (!totalWords) return levelLabel
  return levelLabel + ' · ' + learned + ' of ' + totalWords + ' words'
}
