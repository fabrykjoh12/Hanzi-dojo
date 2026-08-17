// Pure presentation model for Home.
//
// Home answers one question — "what should I do next?" — with a quiet
// greeting, one primary learning action built from the real queue, the story
// that learning unlocks, and a calm progress line. This module turns raw
// counts and fetched rows into exactly what the screen prints, so the JSX
// stays layout-only and every visible string has a test.

import { homeQueueSummary } from './homePresentation'

// The greeting's name half: the first word of the profile's display name,
// or null when there isn't one (the greeting then stands alone). Email-shaped
// display names are not names — greeting someone as "fabrykjoh12@gmail.com"
// is worse than no name at all.
export function greetingName(displayName) {
  const first = String(displayName || '').trim().split(/\s+/)[0] || ''
  if (!first || first.includes('@')) return null
  return first
}

// The primary action block, from the real queue state.
//   kind 'cards'  — a session is waiting; the block is the way in. The sub is
//                   what the session holds — "12 reviews · 4 new · ~6 min" —
//                   from the same counts definition the session serves
//                   (homeCounts.js) and the queue-derived estimate.
//   kind 'clear'  — nothing due; the block goes quiet (and stops being a button).
export function primaryAction({ counts = {}, estimate = '' } = {}) {
  const queue = homeQueueSummary(counts)
  if (queue.failed) {
    return { kind: 'cards', title: 'Continue learning', sub: 'Queue unavailable — starting will retry', cta: 'Start' }
  }
  if (queue.totalReady > 0) {
    const parts = [
      queue.reviewCount + (queue.reviewCount === 1 ? ' review' : ' reviews'),
      queue.newCount + ' new',
    ]
    if (estimate) parts.push(estimate)
    return { kind: 'cards', title: 'Continue learning', sub: parts.join(' · '), cta: 'Start' }
  }
  return { kind: 'clear', title: 'All caught up', sub: 'Nothing due right now', cta: null }
}

// Display size for the primary block's preview word — the prepared session's
// actual first card, shown small and quiet. One line, never clipped.
export function previewWordSize(word = '') {
  const len = [...String(word)].length
  if (len <= 2) return 40
  if (len === 3) return 32
  if (len === 4) return 26
  return 21
}

// "87% readable" — the product's whole promise in two words, printed only
// when the number is real.
export function readableLabel(knownPct) {
  if (typeof knownPct === 'number' && knownPct > 0) return knownPct + '% readable'
  return ''
}

// Status line for the story row. Observational, never a lock: the story is
// openable at any time — "after your cards" states the loop's order, not a
// gate. `stage` is homeDailyStage's output.
export function storyRowStatus({ stage, daily } = {}) {
  if (daily === undefined) return 'Finding today’s story'
  if (stage === 'cards') return 'Today’s story · after your cards'
  if (daily && daily.completedToday) return 'Read today'
  return 'Ready to read'
}

// The practice row's line — printed only when something is genuinely due.
export function practiceSubLabel(grammarDueCount = 0) {
  if (grammarDueCount <= 0) return null
  return grammarDueCount + (grammarDueCount === 1 ? ' grammar pattern due' : ' grammar patterns due')
}
