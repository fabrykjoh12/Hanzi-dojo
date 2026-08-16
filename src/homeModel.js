// Pure presentation model for the Home screen — the "paper deck" redesign.
//
// Home's design principle: the screen shows the product's REAL objects — the
// top card of today's actual deck, today's actual story — never illustrations
// of them. This module turns raw counts and fetched rows into exactly what the
// screen prints, so the JSX stays layout-only and every visible string and
// sizing rule has a test.

import { homeQueueSummary } from './homePresentation'
import { dueLearningCards, dueReviewCards } from './studyAvailability'
import { gentleReviewTarget } from './gentleReturn'
import { buildStudyQueue } from './studyQueue'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December']

// The date eyebrow above the page title, e.g. "Friday · August 16". Rendered
// in small caps by the header style; plain words here so screen readers get a
// sentence rather than shouting.
export function homeDateEyebrow(now = new Date()) {
  return DAYS[now.getDay()] + ' · ' + MONTHS[now.getMonth()] + ' ' + now.getDate()
}

// The count inside the red seal. Three digits stop fitting a 46px stamp.
export function formatSealCount(n) {
  return n > 99 ? '99+' : String(n)
}

// Display size for the hero's hanzi, by character count — one line, centered,
// never clipped. Sizes chosen so 一点儿 and 没关系 still read as display type.
export function hanziDisplaySize(word = '') {
  const len = [...String(word)].length
  if (len <= 2) return 64
  if (len === 3) return 52
  if (len === 4) return 42
  return 34
}

// Everything the deck hero prints. `stage` comes from homeDailyStage; the CTA
// is enabled exactly while cards are the current step (including the failed
// state, where starting a session is the retry).
export function heroModel({ counts = {}, stage, estimate = '' } = {}) {
  const queue = homeQueueSummary(counts)
  const enabled = stage === 'cards'
  if (queue.failed) {
    return {
      seal: '—',
      sub: 'Queue unavailable — starting will retry',
      cta: { label: 'Start cards', enabled },
      showWord: false,
      clear: false,
    }
  }
  if (queue.clear) {
    return {
      seal: '✓',
      sub: 'Nothing due right now',
      cta: { label: 'Cards complete', enabled: false },
      showWord: false,
      clear: true,
    }
  }
  const parts = [
    queue.reviewCount + (queue.reviewCount === 1 ? ' review' : ' reviews'),
    queue.newCount + ' new',
  ]
  if (estimate) parts.push(estimate)
  return {
    seal: formatSealCount(queue.totalReady),
    sub: parts.join(' · '),
    cta: { label: 'Start cards', enabled },
    showWord: true,
    clear: false,
  }
}

// The vocab_id of the card Study's queue will open with — the word printed on
// the hero's paper card, so what you see on Home is what the session deals
// first. This mirrors the opening of Study.loadQueue: the same availability
// predicates, the same gentle-return cap, the same seeded builder. Only the
// learning/review pools are knowable here (the new-card pool needs the level
// vocabulary); a new-cards-only day returns null and the caller falls back to
// the first unstarted curriculum word. If this mirror ever drifts from Study,
// the cost is cosmetic — the hero shows a card from later in the deck.
export function pickDeckPreview({ cards = [], now = new Date(), seed = '', returning = false } = {}) {
  const dueLearning = dueLearningCards(cards, now)
  let dueReview = dueReviewCards(cards, now)
  if (returning) {
    const cap = gentleReviewTarget({ returning, dueReviewCount: dueReview.length })
    if (cap < dueReview.length) {
      dueReview = [...dueReview]
        .sort((a, b) => new Date(a.due_at) - new Date(b.due_at))
        .slice(0, cap)
    }
  }
  const first = buildStudyQueue({ dueLearning, dueReview, newItems: [], seed })[0]
  return first ? first.vocab_id : null
}

// Status line for the story step. Strings are part of the product's calm,
// observational voice — state the fact, never nag.
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

// The story card's eyebrow: level, plus how much of it the learner can already
// read when we know. "HSK 1 · 87% readable" is the product's whole promise in
// five words, so it earns the spot.
export function storyEyebrow({ levelLabel = '', knownPct = null } = {}) {
  if (!levelLabel) return ''
  if (typeof knownPct === 'number' && knownPct > 0) {
    return levelLabel + ' · ' + knownPct + '% readable'
  }
  return levelLabel
}
