import { describe, it, expect } from 'vitest'
import { seededRandom, ridgePath, ridgeLayers } from './inkWash'

describe('seededRandom', () => {
  it('is deterministic for a seed — the skyline must not reshuffle on re-render', () => {
    const a = seededRandom('chinese')
    const b = seededRandom('chinese')
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('gives different languages different skylines', () => {
    expect(seededRandom('chinese')()).not.toBe(seededRandom('japanese')())
  })

  it('stays within [0, 1)', () => {
    const r = seededRandom('x')
    for (let i = 0; i < 200; i += 1) {
      const n = r()
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(1)
    }
  })
})

describe('ridgePath', () => {
  it('closes the band down to the bottom edge so it fills', () => {
    const d = ridgePath({ peaks: 3 })
    expect(d.startsWith('M 0 ')).toBe(true)
    expect(d).toContain('L 100 100')
    expect(d).toContain('L 0 100')
    expect(d.trim().endsWith('Z')).toBe(true)
  })

  it('emits one curve per peak', () => {
    expect((ridgePath({ peaks: 5 }).match(/Q /g) || []).length).toBe(5)
  })

  it('keeps every coordinate inside the viewBox', () => {
    const d = ridgePath({ baseY: 60, amp: 20, peaks: 4 })
    for (const n of d.match(/-?\d+\.?\d*/g).map(Number)) {
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThanOrEqual(100)
    }
  })

  it('is stable for a given seed', () => {
    expect(ridgePath({ seed: 's', peaks: 4 })).toBe(ridgePath({ seed: 's', peaks: 4 }))
  })
})

describe('ridgeLayers', () => {
  it('recedes: farther ridges sit higher and read fainter', () => {
    const layers = ridgeLayers('chinese', 3)
    expect(layers).toHaveLength(3)
    for (let i = 1; i < layers.length; i += 1) {
      expect(layers[i].opacity).toBeGreaterThan(layers[i - 1].opacity)
    }
  })

  it('never exceeds full opacity on the nearest ridge', () => {
    for (const l of ridgeLayers('x', 3)) expect(l.opacity).toBeLessThanOrEqual(1)
  })
})
