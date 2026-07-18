import { describe, it, expect } from 'vitest'
import { dateKey, studyRhythm, rhythmSummary } from './studyRhythm'

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
