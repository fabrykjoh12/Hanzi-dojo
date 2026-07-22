import { describe, it, expect } from 'vitest'
import { ACHIEVEMENTS, evaluateAchievements, countEarned } from './achievements'

const ZERO = { learned: 0, mastered: 0, daysStudied: 0, storiesRead: 0 }

describe('ACHIEVEMENTS definitions', () => {
  it('every entry is well-formed', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.id).toBeTruthy()
      expect(a.group).toBeTruthy()
      expect(a.title).toBeTruthy()
      expect(a.desc).toBeTruthy()
      expect(typeof a.test).toBe('function')
    }
  })

  it('has unique ids', () => {
    const ids = ACHIEVEMENTS.map(a => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('includes the Reading group', () => {
    const reading = ACHIEVEMENTS.filter(a => a.group === 'Reading')
    expect(reading.map(a => a.id)).toEqual(['read_1', 'read_10', 'read_25'])
  })
})

describe('evaluateAchievements', () => {
  it('nothing is earned at zero', () => {
    const earned = evaluateAchievements(ZERO).filter(a => a.earned)
    expect(earned).toHaveLength(0)
  })

  it('earns reading tiers as stories accumulate', () => {
    const byId = id => evaluateAchievements({ ...ZERO, storiesRead: 12 }).find(a => a.id === id)
    expect(byId('read_1').earned).toBe(true)
    expect(byId('read_10').earned).toBe(true)
    expect(byId('read_25').earned).toBe(false)
  })

  it('treats a missing storiesRead as zero (backward compatible)', () => {
    const stats = { learned: 0, mastered: 0, daysStudied: 0 } // no storiesRead
    const reading = evaluateAchievements(stats).filter(a => a.group === 'Reading')
    expect(reading.every(a => !a.earned)).toBe(true)
  })
})

describe('countEarned', () => {
  it('counts across every group', () => {
    const stats = { learned: 50, mastered: 10, daysStudied: 7, storiesRead: 1 }
    // learn_10, learn_50, master_10, days_7, read_1 = 5
    expect(countEarned(stats)).toBe(5)
  })
})
