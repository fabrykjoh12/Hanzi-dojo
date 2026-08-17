// Pure presentation model for the Home screen's daily loop strings. The
// journey layout model (Misty Atmosphere, P1) lives in homeJourney.js and
// composes these; this module owns the status strings the stages print, so
// the JSX stays layout-only and every visible string has a test.

import { homeQueueSummary } from './homePresentation'

// The session card's footer line: what the session contains, in one quiet string.
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
