import { describe, it, expect } from 'vitest'
import { polar, taper, wobble, brushRingPath, clamp01, dojoProgress } from './enso'

describe('polar', () => {
  it('puts 0° at 12 o’clock', () => {
    const [x, y] = polar(50, 50, 10, 0)
    expect(x).toBeCloseTo(50, 6)
    expect(y).toBeCloseTo(40, 6)
  })

  it('runs clockwise', () => {
    const [x, y] = polar(50, 50, 10, 90)
    expect(x).toBeCloseTo(60, 6)
    expect(y).toBeCloseTo(50, 6)
  })
})

describe('taper', () => {
  it('starts thin (the brush landing) and thickens immediately after', () => {
    expect(taper(0)).toBeLessThan(taper(0.06))
  })

  it('thins toward the tail as the brush lifts', () => {
    expect(taper(1)).toBeLessThan(taper(0.5))
    expect(taper(0.5)).toBeLessThan(taper(0.1))
  })

  it('never collapses to zero width', () => {
    for (let t = 0; t <= 1; t += 0.05) expect(taper(t)).toBeGreaterThan(0)
  })
})

describe('wobble', () => {
  it('stays within a sub-pixel deviation of a true circle', () => {
    for (let t = 0; t <= 1; t += 0.02) {
      expect(Math.abs(wobble(t) - 1)).toBeLessThanOrEqual(0.011 + 1e-9)
    }
  })

  it('actually deviates — a perfectly round ring is the thing we are avoiding', () => {
    const samples = [0, 0.25, 0.5, 0.75].map(t => wobble(t))
    expect(new Set(samples.map(n => n.toFixed(4))).size).toBeGreaterThan(1)
  })
})

describe('brushRingPath', () => {
  it('returns a closed path', () => {
    const d = brushRingPath()
    expect(d.startsWith('M ')).toBe(true)
    expect(d.trim().endsWith('Z')).toBe(true)
  })

  it('walks out along one edge and back along the other', () => {
    const steps = 10
    const d = brushRingPath({ steps })
    // (steps + 1) points per edge, the first of which is the M command.
    expect((d.match(/L /g) || []).length).toBe((steps + 1) * 2 - 1)
  })

  it('keeps every point inside the viewBox padding', () => {
    const d = brushRingPath({ r: 38, width: 9 })
    const nums = d.match(/-?\d+\.\d+/g).map(Number)
    for (const n of nums) {
      expect(n).toBeGreaterThan(0)
      expect(n).toBeLessThan(100)
    }
  })
})

describe('clamp01', () => {
  it('clamps out-of-range and non-finite input', () => {
    expect(clamp01(-3)).toBe(0)
    expect(clamp01(2)).toBe(1)
    expect(clamp01(0.4)).toBe(0.4)
    expect(clamp01(NaN)).toBe(0)
    expect(clamp01(undefined)).toBe(0)
  })
})

describe('dojoProgress', () => {
  it('is half closed when half of today is cleared', () => {
    expect(dojoProgress({ done: 5, remaining: 5 }).pct).toBe(0.5)
  })

  it('treats an empty day as complete, not as zero', () => {
    expect(dojoProgress({ done: 0, remaining: 0 }).pct).toBe(1)
    expect(dojoProgress().pct).toBe(1)
  })

  it('is open at the start of a day with work in it', () => {
    expect(dojoProgress({ done: 0, remaining: 12 }).pct).toBe(0)
  })

  it('closes fully once nothing is left', () => {
    expect(dojoProgress({ done: 12, remaining: 0 }).pct).toBe(1)
  })

  it('reports the planned total alongside the fraction', () => {
    expect(dojoProgress({ done: 3, remaining: 7 })).toMatchObject({ done: 3, remaining: 7, planned: 10 })
  })

  it('ignores negative input rather than producing a negative circle', () => {
    expect(dojoProgress({ done: -4, remaining: 8 })).toMatchObject({ done: 0, pct: 0 })
  })
})
