import { describe, it, expect, vi } from 'vitest'

// streak.js imports the Supabase client at module load; stub it so the pure
// liveStreak helper can be tested in isolation.
vi.mock('./supabase', () => ({ supabase: {} }))

import { liveStreak, streakStatus } from './streak'

// Local YYYY-MM-DD for `daysAgo` days ago, matching streak.js's todayStr format.
function ymd(daysAgo) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

describe('liveStreak', () => {
  it('is 0 without a streak or study history', () => {
    expect(liveStreak(null)).toBe(0)
    expect(liveStreak({ streak: 0, last_studied_on: ymd(0) })).toBe(0)
    expect(liveStreak({ streak: 5, last_studied_on: null })).toBe(0)
  })

  it('holds when studied today or yesterday', () => {
    expect(liveStreak({ streak: 5, streak_freezes: 0, last_studied_on: ymd(0) })).toBe(5)
    expect(liveStreak({ streak: 5, streak_freezes: 0, last_studied_on: ymd(1) })).toBe(5)
  })

  it('breaks to 0 when a missed day is not covered by a freeze', () => {
    expect(liveStreak({ streak: 5, streak_freezes: 0, last_studied_on: ymd(2) })).toBe(0)
  })

  it('survives a missed day when a freeze covers it', () => {
    expect(liveStreak({ streak: 5, streak_freezes: 1, last_studied_on: ymd(2) })).toBe(5)
  })

  it('breaks when missed days exceed available freezes', () => {
    expect(liveStreak({ streak: 5, streak_freezes: 1, last_studied_on: ymd(3) })).toBe(0)
  })
})

describe('streakStatus', () => {
  it('reports none without an active streak', () => {
    expect(streakStatus(null)).toBe('none')
    expect(streakStatus({ streak: 0, last_studied_on: ymd(0) })).toBe('none')
  })

  it('is safe after studying today', () => {
    expect(streakStatus({ streak: 5, streak_freezes: 0, last_studied_on: ymd(0) })).toBe('safe')
  })

  it('is due_today after studying yesterday', () => {
    expect(streakStatus({ streak: 5, streak_freezes: 0, last_studied_on: ymd(1) })).toBe('due_today')
  })

  it('is frozen when a missed day is covered by a freeze', () => {
    expect(streakStatus({ streak: 5, streak_freezes: 1, last_studied_on: ymd(2) })).toBe('frozen')
  })

  it('is broken when missed days exceed freezes', () => {
    expect(streakStatus({ streak: 5, streak_freezes: 0, last_studied_on: ymd(2) })).toBe('broken')
  })
})
