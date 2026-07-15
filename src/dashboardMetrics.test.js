import { describe, it, expect } from 'vitest'
import { pct, withConversion, median, fillDailySeries, storyCompletionRate } from './dashboardMetrics'

describe('pct', () => {
  it('rounds a ratio to an integer percent', () => {
    expect(pct(1, 4)).toBe(25)
    expect(pct(2, 3)).toBe(67)
  })
  it('is 0 when the denominator is 0 or missing', () => {
    expect(pct(5, 0)).toBe(0)
    expect(pct(5, -1)).toBe(0)
  })
})

describe('withConversion', () => {
  it('adds pctOfTop and pctOfPrev for each stage', () => {
    const out = withConversion([
      { stage: 'landing', count: 100 },
      { stage: 'signup', count: 40 },
      { stage: 'onboarding', count: 20 },
    ])
    expect(out[0]).toEqual({ stage: 'landing', count: 100, pctOfTop: 100, pctOfPrev: 100 })
    expect(out[1]).toEqual({ stage: 'signup', count: 40, pctOfTop: 40, pctOfPrev: 40 })
    expect(out[2]).toEqual({ stage: 'onboarding', count: 20, pctOfTop: 20, pctOfPrev: 50 })
  })
  it('handles an empty top stage without dividing by zero', () => {
    const out = withConversion([{ stage: 'landing', count: 0 }, { stage: 'signup', count: 0 }])
    expect(out[1].pctOfTop).toBe(0)
    expect(out[1].pctOfPrev).toBe(0)
  })
})

describe('median', () => {
  it('returns the middle of an odd-length set', () => {
    expect(median([3, 1, 2])).toBe(2)
  })
  it('averages the two middles of an even-length set', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })
  it('is 0 for an empty set', () => {
    expect(median([])).toBe(0)
  })
})

describe('fillDailySeries', () => {
  it('fills missing days with 0 and sorts ascending', () => {
    const out = fillDailySeries(
      [{ day: '2026-07-03', dau: 5 }, { day: '2026-07-01', dau: 2 }],
      '2026-07-01', '2026-07-04',
    )
    expect(out).toEqual([
      { day: '2026-07-01', dau: 2 },
      { day: '2026-07-02', dau: 0 },
      { day: '2026-07-03', dau: 5 },
    ])
  })
})

describe('storyCompletionRate', () => {
  it('is completed/opened over summed totals', () => {
    expect(storyCompletionRate([
      { opened: 10, completed: 4 },
      { opened: 10, completed: 6 },
    ])).toBe(50)
  })
  it('is 0 when nothing was opened', () => {
    expect(storyCompletionRate([])).toBe(0)
  })
})
