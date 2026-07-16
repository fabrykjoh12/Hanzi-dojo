import { describe, it, expect } from 'vitest'
import {
  pct, withConversion, fillDailySeries, storyCompletionRate,
  filterStoryRows, storyLanguageBreakdown, retentionSummary, retentionAverages,
} from './dashboardMetrics'

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

describe('filterStoryRows', () => {
  const rows = [
    { language: 'chinese', opened: 10, completed: 4 },
    { language: 'japanese', opened: 6, completed: 3 },
  ]
  it('keeps every row when no language is given', () => {
    expect(filterStoryRows(rows, null)).toHaveLength(2)
    expect(filterStoryRows(rows, '')).toHaveLength(2)
  })
  it('scopes to a single language', () => {
    expect(filterStoryRows(rows, 'japanese')).toEqual([{ language: 'japanese', opened: 6, completed: 3 }])
  })
  it('feeds storyCompletionRate a language-scoped rate', () => {
    expect(storyCompletionRate(filterStoryRows(rows, 'chinese'))).toBe(40)
  })
})

describe('storyLanguageBreakdown', () => {
  it('adds a per-language completion rate and sorts by opened volume', () => {
    const out = storyLanguageBreakdown([
      { language: 'japanese', opened: 6, completed: 3 },
      { language: 'chinese', opened: 10, completed: 4 },
    ])
    expect(out[0]).toEqual({ language: 'chinese', opened: 10, completed: 4, rate: 40 })
    expect(out[1]).toEqual({ language: 'japanese', opened: 6, completed: 3, rate: 50 })
  })
  it('is empty for no rows', () => {
    expect(storyLanguageBreakdown([])).toEqual([])
  })
})

describe('retentionSummary', () => {
  // Cohort day 2026-07-01; "today" 2026-07-10 → D1 and D7 matured, D30 not.
  const rows = [{ cohort_day: '2026-07-01', cohort_size: 10, d1: 6, d7: 3, d30: 0 }]
  it('reports matured buckets as a percentage of cohort size', () => {
    const [r] = retentionSummary(rows, '2026-07-10')
    expect(r.size).toBe(10)
    expect(r.d1).toEqual({ matured: true, pct: 60, count: 6 })
    expect(r.d7).toEqual({ matured: true, pct: 30, count: 3 })
  })
  it('marks a bucket immature (—, not 0%) until N days have elapsed', () => {
    const [r] = retentionSummary(rows, '2026-07-10')
    expect(r.d30).toEqual({ matured: false, pct: null, count: null })
  })
  it('treats the exact maturity day as matured', () => {
    // 2026-07-01 + 7 = 2026-07-08 → D7 is measurable that day.
    const [r] = retentionSummary(rows, '2026-07-08')
    expect(r.d7.matured).toBe(true)
    expect(r.d30.matured).toBe(false)
  })
})

describe('retentionAverages', () => {
  it('blends only matured cohorts per bucket', () => {
    const rows = [
      { cohort_day: '2026-07-01', cohort_size: 10, d1: 5, d7: 2, d30: 1 }, // fully matured by 2026-08-10
      { cohort_day: '2026-08-09', cohort_size: 4, d1: 2, d7: 0, d30: 0 },  // only D1 matured on 2026-08-10
    ]
    const avg = retentionAverages(rows, '2026-08-10')
    // D1: (5+2)/(10+4) = 50%. D7/D30: only the first cohort has matured.
    expect(avg.d1).toBe(50)
    expect(avg.d7).toBe(20)
    expect(avg.d30).toBe(10)
  })
  it('returns null for a bucket no cohort has matured into yet', () => {
    const rows = [{ cohort_day: '2026-08-10', cohort_size: 5, d1: 0, d7: 0, d30: 0 }]
    const avg = retentionAverages(rows, '2026-08-10')
    expect(avg.d1).toBeNull()
    expect(avg.d7).toBeNull()
    expect(avg.d30).toBeNull()
  })
})
