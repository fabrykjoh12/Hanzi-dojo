import { describe, it, expect } from 'vitest'
import { dateKey, studyRhythm, rhythmSummary, weekdayInitial } from './studyRhythm'

// A fixed local "now" (a Wednesday) so the 7-day window is deterministic.
const NOW = new Date('2026-07-15T10:00:00')

describe('dateKey', () => {
  it('formats a local YYYY-MM-DD with zero-padding', () => {
    expect(dateKey(new Date('2026-03-05T23:00:00'))).toBe('2026-03-05')
    expect(dateKey(new Date('2026-11-20T00:00:00'))).toBe('2026-11-20')
  })
})

describe('studyRhythm', () => {
  it('returns `days` entries, oldest first, ending today', () => {
    const r = studyRhythm([], NOW, 7)
    expect(r).toHaveLength(7)
    expect(r[0].date).toBe('2026-07-09')
    expect(r[6].date).toBe('2026-07-15')
    expect(r[6].isToday).toBe(true)
    expect(r.every(x => x.studied === false)).toBe(true)
  })

  it('flags the days that were studied', () => {
    const r = studyRhythm(['2026-07-15', '2026-07-13', '2026-07-10'], NOW, 7)
    expect(r.filter(x => x.studied).map(x => x.date)).toEqual(['2026-07-10', '2026-07-13', '2026-07-15'])
  })

  it('ignores studied dates outside the window', () => {
    const r = studyRhythm(['2026-07-01', '2026-07-08'], NOW, 7)
    // 07-08 is one day before the 7-day window (09→15); 07-01 far outside.
    expect(r.every(x => x.studied === false)).toBe(true)
  })

  it('accepts a Set as well as an array', () => {
    const r = studyRhythm(new Set(['2026-07-15']), NOW, 7)
    expect(r[6].studied).toBe(true)
  })

  it('handles a zero-day window', () => {
    expect(studyRhythm(['2026-07-15'], NOW, 0)).toEqual([])
  })
})

describe('rhythmSummary', () => {
  it('counts studied days out of the window length', () => {
    const r = studyRhythm(['2026-07-15', '2026-07-13', '2026-07-10'], NOW, 7)
    expect(rhythmSummary(r)).toEqual({ studiedDays: 3, days: 7 })
  })

  it('is 0 of N for an untouched week', () => {
    expect(rhythmSummary(studyRhythm([], NOW, 7))).toEqual({ studiedDays: 0, days: 7 })
  })
})

describe('weekdayInitial', () => {
  it('labels a date with its local weekday letter', () => {
    // 2026-07-25 is a Saturday.
    expect(weekdayInitial('2026-07-25')).toBe('S')
    expect(weekdayInitial('2026-07-27')).toBe('M')
  })

  it('does not slip a day for timezones west of UTC', () => {
    // Parsed as bare UTC midnight this would render as the 24th (a Friday) in
    // any negative-offset zone. Noon-anchored, it stays Saturday everywhere.
    expect(weekdayInitial('2026-07-25')).toBe('S')
  })

  it('is safe on junk input', () => {
    expect(weekdayInitial('')).toBe('')
    expect(weekdayInitial(undefined)).toBe('')
    expect(weekdayInitial('not-a-date')).toBe('')
  })
})
