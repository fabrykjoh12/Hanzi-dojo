import { describe, it, expect } from 'vitest'
import { studyAvailability, availabilityBreakdown } from './studyAvailability'
import { GENTLE_REVIEW_CAP } from './gentleReturn'

// The bug this module exists to make impossible: Home said 74, the session
// served 136, and neither file was wrong on its own terms. These tests pin the
// three ways they used to differ.

const NOW = new Date('2026-08-13T09:00:00')
const past = new Date('2026-08-01T09:00:00').toISOString()
const future = new Date('2026-08-20T09:00:00').toISOString()

function card(id, o = {}) {
  return {
    id, vocab_id: 'v' + id, state: 'review', due_at: past,
    stability: 20, lapses: 0, ...o,
  }
}

describe('what is due does not depend on the level window', () => {
  it('counts a card whose word sits outside the window — the learner owns it', () => {
    // This is difference #1: Home used to filter these away, so a dictionary
    // word or a word saved from a story above your level was invisible on Home
    // and served by the session.
    const cards = [
      card(1),
      card(2, { vocab_id: 'dictionary-word' }),
      card(3, { vocab_id: 'above-level' }),
    ]
    const a = studyAvailability({
      cards, windowVocabIds: new Set(['v1']), now: NOW,
    })
    expect(a.counts.reviewsDue).toBe(3)
    expect(a.counts.totalReady).toBe(3)
  })

  it('still refuses to introduce a new word from outside the window', () => {
    // New cards ARE a curriculum decision, so they stay window-scoped. The
    // caller counts the unstarted window words; this module never guesses.
    const a = studyAvailability({
      cards: [], unstartedInWindow: 12, dailyNewCards: 5, now: NOW,
    })
    expect(a.counts.newAvailable).toBe(5)
  })
})

describe('the number a screen leads with is what the session will serve', () => {
  it('adds learning, reviews and new into one total', () => {
    const cards = [
      card(1), card(2),
      card(3, { state: 'learning', stability: 1 }),
      card(4, { state: 'relearning', stability: 1 }),
      card(5, { due_at: future }),
    ]
    const a = studyAvailability({
      cards, unstartedInWindow: 30, dailyNewCards: 10, introducedToday: 4, now: NOW,
    })
    expect(a.counts.reviewsDue).toBe(2)
    expect(a.counts.learningDue).toBe(2)
    expect(a.counts.newAvailable).toBe(6)   // 10 allowed − 4 already introduced
    expect(a.counts.totalReady).toBe(10)
  })

  it('says it in words the same way it counted it', () => {
    const a = studyAvailability({
      cards: [card(1), card(2, { state: 'learning' })],
      unstartedInWindow: 9, dailyNewCards: 3, now: NOW,
    })
    expect(availabilityBreakdown(a.counts)).toEqual(['2 reviews', '3 new'])
    expect(availabilityBreakdown({ reviewsDue: 1, learningDue: 0, newAvailable: 0 }))
      .toEqual(['1 review'])
    expect(availabilityBreakdown(null)).toEqual([])
  })
})

describe('the gentle-return cap is part of what is available', () => {
  // 74 overdue reviews, oldest first — the device's real number. Every date is
  // in the past: a fixture that walked forward from July put a third of them in
  // the future and quietly tested something else.
  const backlog = Array.from({ length: 74 }, (_, i) => card(i + 1, {
    due_at: new Date(NOW.getTime() - (80 - i) * 864e5).toISOString(),
  }))

  it('advertises the capped set, not the backlog, when returning from a break', () => {
    const a = studyAvailability({ cards: backlog, returning: true, now: NOW })
    expect(a.counts.reviewsDue).toBe(GENTLE_REVIEW_CAP)
    expect(a.counts.reviewsDeferred).toBe(74 - GENTLE_REVIEW_CAP)
    expect(a.counts.cappedByReturn).toBe(true)
    expect(a.counts.totalReady).toBe(GENTLE_REVIEW_CAP)
  })

  it('keeps the oldest-due cards, which is the order the session serves them in', () => {
    const a = studyAvailability({ cards: backlog, returning: true, now: NOW })
    const kept = a.reviews.map(c => c.id)
    expect(kept[0]).toBe(1)
    expect(kept[kept.length - 1]).toBe(GENTLE_REVIEW_CAP)
  })

  it('does not cap anyone who is simply studying daily', () => {
    const a = studyAvailability({ cards: backlog, returning: false, now: NOW })
    expect(a.counts.reviewsDue).toBe(74)
    expect(a.counts.cappedByReturn).toBe(false)
    expect(a.counts.reviewsDeferred).toBe(0)
  })
})

describe('the quiet day', () => {
  it('reports when the next review lands, and counts nothing as ready', () => {
    const a = studyAvailability({
      cards: [card(1, { due_at: future }), card(2, { due_at: '2026-08-15T09:00:00.000Z' })],
      now: NOW,
    })
    expect(a.counts.totalReady).toBe(0)
    expect(a.counts.nextReviewAt).toBe('2026-08-15T09:00:00.000Z')
  })

  it('has no next review when there are no scheduled cards at all', () => {
    expect(studyAvailability({ cards: [], now: NOW }).counts.nextReviewAt).toBeNull()
    expect(studyAvailability({}).counts.totalReady).toBe(0)
  })
})

describe('the sets and the counts are the same objects', () => {
  it('hands back the rows it counted, so a queue cannot drift from a number', () => {
    const cards = [card(1), card(2, { state: 'learning' }), card(3, { due_at: future })]
    const a = studyAvailability({ cards, now: NOW })
    expect(a.reviews.map(c => c.id)).toEqual([1])
    expect(a.learning.map(c => c.id)).toEqual([2])
    expect(a.counts.reviewsDue).toBe(a.reviews.length)
    expect(a.counts.learningDue).toBe(a.learning.length)
  })
})
