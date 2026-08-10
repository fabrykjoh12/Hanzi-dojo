import { describe, it, expect } from 'vitest'
import { SPEEDS, nextSpeed, seedSpeed } from './audioSpeed'

// Three controls for one feature — Replay, a turtle, and a speed chip — was the
// clutter reported from a device, and two of the three meant "slower". The
// turtle is gone; these specs pin what the surviving speed control does.

describe('the playback speeds', () => {
  it('offers a gentle slow-down and a gentle speed-up around 1x', () => {
    expect(SPEEDS).toEqual([1, 0.75, 1.25])
  })

  it('no longer offers 0.5x', () => {
    // Half speed smears the tones of a synthesized clip, which is the opposite
    // of what a learner slows a word down for. The genuinely slow reading was
    // always the separately synthesized clip, not a dragged-out one.
    expect(SPEEDS).not.toContain(0.5)
  })

  it('cycles, and comes back to where it started', () => {
    let s = 1
    const seen = []
    for (let i = 0; i < SPEEDS.length; i += 1) { s = nextSpeed(s); seen.push(s) }
    expect(seen[seen.length - 1]).toBe(1)
    expect(new Set(seen).size).toBe(SPEEDS.length)
  })

  it('steps in a predictable order', () => {
    expect(nextSpeed(1)).toBe(0.75)
    expect(nextSpeed(0.75)).toBe(1.25)
    expect(nextSpeed(1.25)).toBe(1)
  })

  it('recovers from a rate that is no longer offered', () => {
    expect(nextSpeed(0.5)).toBe(1)
    expect(nextSpeed(undefined)).toBe(1)
  })
})

describe('seeding from a saved preference', () => {
  it('keeps a rate the learner chose', () => {
    expect(seedSpeed(0.75)).toBe(0.75)
    expect(seedSpeed(1.25)).toBe(1.25)
    expect(seedSpeed(1)).toBe(1)
  })

  it('moves a retired 0.5 to the nearest thing it meant, not to 1x', () => {
    // Someone who chose half speed wanted slow. Snapping them to normal would
    // silently undo a preference; 0.75 is the nearest surviving answer.
    expect(seedSpeed(0.5)).toBe(0.75)
  })

  it('falls back to normal speed for anything unrecognised', () => {
    expect(seedSpeed(null)).toBe(1)
    expect(seedSpeed(undefined)).toBe(1)
    expect(seedSpeed(2)).toBe(1)
    expect(seedSpeed('fast')).toBe(1)
  })
})
