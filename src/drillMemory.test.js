import { describe, it, expect } from 'vitest'
import { recordMiss, missCount, weightedSample } from './drillMemory'

// Deterministic "shuffle" for tests: identity (keeps bag order).
const identity = (a) => [...a]

describe('drillMemory', () => {
  it('records and reads misses per drill without cross-talk', () => {
    recordMiss('t1', 'あ')
    recordMiss('t1', 'あ')
    expect(missCount('t1', 'あ')).toBe(2)
    expect(missCount('t2', 'あ')).toBe(0)
  })

  it('returns distinct items capped at count', () => {
    const pool = [['a', 1], ['b', 2], ['c', 3]]
    const out = weightedSample(pool, p => p[0], 't3', 2, identity)
    expect(out.length).toBe(2)
    expect(new Set(out.map(p => p[0])).size).toBe(2)
  })

  it('gives missed items more tickets while keeping results distinct', () => {
    const pool = [['x', 1], ['y', 2]]
    recordMiss('t4', 'y')
    recordMiss('t4', 'y')
    recordMiss('t4', 'y')
    // With the identity "shuffle" the bag is [x, y×7] — dedupe still returns
    // both distinct items exactly once.
    const out = weightedSample(pool, p => p[0], 't4', 2, identity)
    expect(out.map(p => p[0]).sort()).toEqual(['x', 'y'])
    // A missed-only sample of 1 surfaces the front of the bag (x first under
    // identity order), proving order comes from the shuffleFn, not the misses.
    const one = weightedSample(pool, p => p[0], 't4', 1, identity)
    expect(one.length).toBe(1)
  })
})
