import { describe, it, expect } from 'vitest'
import { reviewForecast, forecastSummary, forecastA11yLabel } from './reviewForecast'

// Fixed "now" so day math is deterministic (a Wednesday, mid-morning local).
const NOW = new Date('2026-07-15T10:00:00')

function reviewCard(dueAt) {
  return { state: 'review', due_at: new Date(dueAt).toISOString() }
}

describe('reviewForecast', () => {
  it('returns `days` buckets, all zero for no cards', () => {
    expect(reviewForecast([], NOW, 7)).toEqual([0, 0, 0, 0, 0, 0, 0])
  })

  it('buckets reviews by local day offset from today', () => {
    const cards = [
      reviewCard('2026-07-15T20:00:00'),  // today → 0
      reviewCard('2026-07-16T06:00:00'),  // tomorrow → 1
      reviewCard('2026-07-16T23:00:00'),  // tomorrow → 1
      reviewCard('2026-07-21T09:00:00'),  // +6 days → 6
    ]
    expect(reviewForecast(cards, NOW, 7)).toEqual([1, 2, 0, 0, 0, 0, 1])
  })

  it('folds overdue reviews into today (index 0)', () => {
    const cards = [reviewCard('2026-07-10T09:00:00'), reviewCard('2026-07-14T09:00:00')]
    expect(reviewForecast(cards, NOW, 7)[0]).toBe(2)
  })

  it('drops reviews beyond the window', () => {
    const cards = [reviewCard('2026-07-30T09:00:00')]
    expect(reviewForecast(cards, NOW, 7)).toEqual([0, 0, 0, 0, 0, 0, 0])
  })

  it('excludes learning/relearning/new cards — only scheduled reviews count', () => {
    const cards = [
      { state: 'learning', due_at: '2026-07-16T09:00:00' },
      { state: 'relearning', due_at: '2026-07-16T09:00:00' },
      { state: 'new', due_at: null },
      reviewCard('2026-07-16T09:00:00'),
    ]
    expect(reviewForecast(cards, NOW, 7)).toEqual([0, 1, 0, 0, 0, 0, 0])
  })

  it('ignores malformed / missing due dates without throwing', () => {
    const cards = [
      { state: 'review', due_at: 'not-a-date' },
      { state: 'review', due_at: null },
      null,
    ]
    expect(reviewForecast(cards, NOW, 7)).toEqual([0, 0, 0, 0, 0, 0, 0])
  })

  it('handles a zero-day window', () => {
    expect(reviewForecast([reviewCard('2026-07-15T20:00:00')], NOW, 0)).toEqual([])
  })
})

describe('forecastSummary', () => {
  it('summarizes total, peak and a ~per-day average', () => {
    expect(forecastSummary([1, 2, 0, 0, 0, 0, 1])).toEqual({ total: 4, peak: 2, perDay: 1 })
  })

  it('is all zeros for an empty week', () => {
    expect(forecastSummary([0, 0, 0, 0, 0, 0, 0])).toEqual({ total: 0, peak: 0, perDay: 0 })
  })

  it('rounds the average up to at least 1 when there is anything', () => {
    expect(forecastSummary([3, 0, 0, 0, 0, 0, 0]).perDay).toBe(1)
  })
})

describe('forecastA11yLabel', () => {
  it('summarizes the chart for screen readers', () => {
    expect(forecastA11yLabel([2, 3, 0, 1, 0, 0, 4])).toBe(
      'Review forecast, next 7 days: about 1 a day, 10 total, busiest day 4.',
    )
  })
  it('states clearly when nothing is scheduled', () => {
    expect(forecastA11yLabel([0, 0, 0, 0, 0, 0, 0])).toBe('No reviews scheduled in the next 7 days.')
  })
  it('honours a custom window length', () => {
    expect(forecastA11yLabel([1, 1], 2)).toMatch(/next 2 days/)
  })
})
