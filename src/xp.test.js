import { describe, it, expect } from 'vitest'
import { xpForGrade, levelInfo } from './xp'

describe('xpForGrade', () => {
  it('rewards weaker recalls less than confident ones', () => {
    expect(xpForGrade(0)).toBe(2)  // Again
    expect(xpForGrade(1)).toBe(6)  // Hard
    expect(xpForGrade(2)).toBe(10) // Good
    expect(xpForGrade(3)).toBe(10) // Easy
  })
})

describe('levelInfo', () => {
  it('starts everyone at level 1 with no XP', () => {
    const l = levelInfo(0)
    expect(l.level).toBe(1)
    expect(l.intoLevel).toBe(0)
    expect(l.levelSpan).toBe(150) // 150 + (1-1)*110
    expect(l.pct).toBe(0)
  })

  it('reports progress within the current level', () => {
    const l = levelInfo(75)
    expect(l.level).toBe(1)
    expect(l.intoLevel).toBe(75)
    expect(l.pct).toBe(50) // 75 / 150
  })

  it('advances to level 2 once the first 150 XP are cleared', () => {
    const l = levelInfo(150)
    expect(l.level).toBe(2)
    expect(l.intoLevel).toBe(0)
    expect(l.levelSpan).toBe(260) // 150 + (2-1)*110
  })

  it('is monotonic and never negative', () => {
    let prev = 0
    for (let xp = 0; xp <= 2000; xp += 37) {
      const l = levelInfo(xp)
      expect(l.level).toBeGreaterThanOrEqual(prev)
      expect(l.intoLevel).toBeGreaterThanOrEqual(0)
      expect(l.intoLevel).toBeLessThan(l.levelSpan)
      prev = l.level
    }
  })

  it('treats missing/garbage input as 0', () => {
    expect(levelInfo(undefined).level).toBe(1)
    expect(levelInfo(null).level).toBe(1)
    expect(levelInfo(-999).level).toBe(1)
  })
})
