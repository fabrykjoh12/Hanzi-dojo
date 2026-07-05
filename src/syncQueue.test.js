import { describe, it, expect } from 'vitest'
import { xpTotalOf, dayCountsOf, reconcileAward } from './syncQueue'

describe('xpTotalOf', () => {
  it('sums xpDelta and ignores missing/zero', () => {
    expect(xpTotalOf([{ xpDelta: 3 }, { xpDelta: 5 }, {}, { xpDelta: 0 }])).toBe(8)
    expect(xpTotalOf([])).toBe(0)
  })
})

describe('dayCountsOf', () => {
  it('buckets grade ops per day and state', () => {
    const ops = [
      { kind: 'grade', day: '2026-07-05', state: 'new' },
      { kind: 'grade', day: '2026-07-05', state: 'review' },
      { kind: 'grade', day: '2026-07-05', state: 'learning' },
      { kind: 'grade', day: '2026-07-06', state: 'new' },
      { kind: 'storyRead', day: '2026-07-05' }, // ignored
    ]
    const d = dayCountsOf(ops)
    expect(d['2026-07-05']).toEqual({ studied: 3, new: 1, learning: 1, review: 1 })
    expect(d['2026-07-06']).toEqual({ studied: 1, new: 1, learning: 0, review: 0 })
  })

  it('treats relearning as learning bucket', () => {
    const d = dayCountsOf([{ kind: 'grade', day: 'x', state: 'relearning' }])
    expect(d.x).toEqual({ studied: 1, new: 0, learning: 1, review: 0 })
  })
})

describe('reconcileAward', () => {
  it('adds xp without leveling (no freeze field)', () => {
    const u = reconcileAward(10, 5, 0)
    expect(u.total_xp).toBe(15)
    expect(u.streak_freezes).toBeUndefined()
  })

  it('grants a capped freeze on level-up', () => {
    // level thresholds come from xp.levelInfo; pick a big jump from 0 that
    // crosses at least one level so a freeze is granted.
    const u = reconcileAward(0, 100000, 0)
    expect(u.total_xp).toBe(100000)
    expect(u.streak_freezes).toBeGreaterThanOrEqual(1)
    expect(u.streak_freezes).toBeLessThanOrEqual(5)
  })

  it('never exceeds the freeze cap', () => {
    const u = reconcileAward(0, 100000000, 5)
    expect(u.streak_freezes).toBe(5)
  })

  it('floors negatives to a no-op add', () => {
    expect(reconcileAward(20, -5, 0).total_xp).toBe(20)
  })
})
