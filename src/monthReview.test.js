import { describe, it, expect } from 'vitest'
import { monthReview, monthHeadline, monthShareText, MONTH_NAMES } from './monthReview'

// A fixed "now" so the month window is deterministic: 15 March 2026.
const NOW = new Date(2026, 2, 15, 12, 0, 0)

describe('monthReview', () => {
  it('sums only the current month, ignoring other months and zero days', () => {
    const activity = {
      '2026-03-01': 10,
      '2026-03-04': 5,
      '2026-03-09': 0,     // zero → not counted as active
      '2026-02-28': 99,    // previous month → excluded
      '2026-04-01': 7,     // next month → excluded
    }
    const r = monthReview(activity, NOW)
    expect(r.ym).toBe('2026-03')
    expect(r.monthName).toBe('March')
    expect(r.activeDays).toBe(2)
    expect(r.reviews).toBe(15)
    expect(r.daysInMonth).toBe(31)
    expect(r.dayOfMonth).toBe(15)
    expect(r.avgPerActiveDay).toBe(8)   // round(15/2)
  })

  it('finds the best day', () => {
    const r = monthReview({ '2026-03-02': 4, '2026-03-05': 12, '2026-03-06': 9 }, NOW)
    expect(r.bestDay).toEqual({ date: '2026-03-05', count: 12 })
  })

  it('handles an empty / missing month', () => {
    const r = monthReview({}, NOW)
    expect(r.activeDays).toBe(0)
    expect(r.reviews).toBe(0)
    expect(r.bestDay).toBe(null)
    expect(r.avgPerActiveDay).toBe(0)
  })

  it('tolerates junk input', () => {
    expect(monthReview(null, NOW).activeDays).toBe(0)
    expect(monthReview(undefined, NOW).reviews).toBe(0)
  })

  it('does not confuse month prefixes (2026-01 vs 2026-1x)', () => {
    // Guards the YYYY-MM- delimiter: October must not swallow other months.
    const oct = new Date(2026, 9, 10, 12)
    const r = monthReview({ '2026-10-01': 3, '2026-01-01': 8 }, oct)
    expect(r.ym).toBe('2026-10')
    expect(r.activeDays).toBe(1)
    expect(r.reviews).toBe(3)
  })

  it('exposes all twelve month names', () => {
    expect(MONTH_NAMES).toHaveLength(12)
    expect(MONTH_NAMES[0]).toBe('January')
    expect(MONTH_NAMES[11]).toBe('December')
  })
})

describe('monthHeadline', () => {
  it('greets a fresh month with no pressure', () => {
    const r = monthReview({}, NOW)
    expect(monthHeadline(r)).toMatch(/fresh start to March/i)
  })

  it('reflects days shown up out of days elapsed', () => {
    const r = monthReview({ '2026-03-01': 5, '2026-03-02': 5 }, NOW)
    expect(monthHeadline(r)).toBe("You've shown up 2 of 15 days so far this March.")
  })

  it('uses the singular for a single day', () => {
    const r = monthReview({ '2026-03-01': 5 }, NOW)
    expect(monthHeadline(r)).toContain('1 of 15 day ')
  })

  it('is safe on null', () => {
    expect(monthHeadline(null)).toMatch(/fresh start/i)
  })
})

describe('monthShareText', () => {
  it('builds a friendly line with the language and mastered count', () => {
    const r = monthReview({ '2026-03-01': 10, '2026-03-04': 5 }, NOW)
    const text = monthShareText(r, { languageName: 'Chinese', mastered: 42, brandUrl: 'https://x.test' })
    expect(text).toContain('My March on Hanzi Dojo')
    expect(text).toContain('2 active days')
    expect(text).toContain('15 reviews')
    expect(text).toContain('42 words mastered learning Chinese')
    expect(text.endsWith('https://x.test')).toBe(true)
  })

  it('omits the url when none is given and defaults sensibly', () => {
    const r = monthReview({ '2026-03-01': 3 }, NOW)
    const text = monthShareText(r)
    expect(text).toContain('1 active day')          // singular
    expect(text).toContain('0 words mastered learning a new language')
    expect(text).not.toMatch(/https?:/)
  })
})
