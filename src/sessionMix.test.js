import { describe, it, expect } from 'vitest'
import { sessionMix, mixKey, mixTone, MIX_KEYS, MIX_LABELS } from './sessionMix'

const q = (...states) => states.map(state => ({ state }))

describe('mixKey', () => {
  it('maps new cards to new', () => {
    expect(mixKey({ state: 'new' })).toBe('new')
  })

  it('groups learning and relearning together', () => {
    expect(mixKey({ state: 'learning' })).toBe('learning')
    expect(mixKey({ state: 'relearning' })).toBe('learning')
  })

  it('treats review as due', () => {
    expect(mixKey({ state: 'review' })).toBe('due')
  })

  // Legacy rows written before the FSRS states existed must still be counted,
  // or the rail total would silently disagree with the queue length.
  it('falls back to due for a missing or unknown state', () => {
    expect(mixKey({})).toBe('due')
    expect(mixKey(null)).toBe('due')
    expect(mixKey({ state: 'suspended' })).toBe('due')
  })
})

describe('sessionMix counts', () => {
  it('counts what is left, by kind', () => {
    const mix = sessionMix(q('new', 'new', 'review', 'learning', 'relearning', 'review'), 0)
    expect(mix.counts).toEqual({ new: 2, learning: 2, due: 2 })
    expect(mix.remaining).toBe(6)
  })

  it('adds graded cards to the total but not to the remaining counts', () => {
    const mix = sessionMix(q('new', 'review'), 4)
    expect(mix.remaining).toBe(2)
    expect(mix.done).toBe(4)
    expect(mix.total).toBe(6)
  })

  it('handles an empty or missing queue', () => {
    expect(sessionMix([], 0).total).toBe(0)
    expect(sessionMix(undefined, 0).remaining).toBe(0)
    expect(sessionMix(null, 3).total).toBe(3)
  })

  it('never reports a negative done count', () => {
    expect(sessionMix(q('new'), -2).done).toBe(0)
  })
})

describe('sessionMix segments', () => {
  it('splits the rail into done plus the three remaining kinds', () => {
    const mix = sessionMix(q('new', 'learning', 'review'), 1)
    expect(mix.segments.map(s => s.key)).toEqual(['done', 'new', 'learning', 'due'])
    expect(mix.segments.map(s => s.count)).toEqual([1, 1, 1, 1])
    for (const seg of mix.segments) expect(seg.pct).toBeCloseTo(25)
  })

  it('sums to 100% whenever there is anything in the session', () => {
    const mix = sessionMix(q('new', 'new', 'new', 'review', 'learning'), 3)
    const sum = mix.segments.reduce((acc, s) => acc + s.pct, 0)
    expect(sum).toBeCloseTo(100)
  })

  it('reports 0% everywhere rather than dividing by zero on an empty session', () => {
    for (const seg of sessionMix([], 0).segments) expect(seg.pct).toBe(0)
  })

  // The whole point of the redesign: on card 1 the rail is already fully
  // painted with the session's composition, instead of one empty grey line.
  it('paints the full rail before anything has been graded', () => {
    const mix = sessionMix(q('new', 'review', 'review'), 0)
    expect(mix.segments[0].pct).toBe(0)
    const painted = mix.segments.slice(1).reduce((acc, s) => acc + s.pct, 0)
    expect(painted).toBeCloseTo(100)
  })

  // An Again-graded card comes back into the queue as `learning`; the total has
  // to grow with it rather than letting done+remaining exceed a fixed estimate.
  it('grows the total when a graded card re-enters the queue', () => {
    const before = sessionMix(q('review', 'review'), 5)
    const after = sessionMix(q('review', 'learning'), 5)
    expect(after.total).toBe(before.total)
    expect(after.counts.learning).toBe(1)
    expect(sessionMix(q('review', 'review', 'learning'), 5).total).toBe(8)
  })
})

describe('mixTone', () => {
  it('uses the raw accent for completed work', () => {
    expect(mixTone('#B83A24', 'done')).toBe('#B83A24')
  })

  // Tints must mix into the surface, never an alpha hex, or they stay light in
  // dark mode (CLAUDE.md §5).
  it('mixes remaining bands into the surface token', () => {
    for (const key of MIX_KEYS) {
      const tone = mixTone('#2563C9', key)
      expect(tone.indexOf('color-mix(in srgb, #2563C9 ')).toBe(0)
      expect(tone.indexOf('var(--surface)')).toBeGreaterThan(0)
    }
  })

  it('ramps new lighter than learning, and learning lighter than due', () => {
    const pct = key => Number(mixTone('#2E3A6E', key).split(' ')[3].replace('%,', ''))
    expect(pct('new')).toBeLessThan(pct('learning'))
    expect(pct('learning')).toBeLessThan(pct('due'))
  })

  it('falls back to the due tone for an unknown key', () => {
    expect(mixTone('#B83A24', 'nonsense')).toBe(mixTone('#B83A24', 'due'))
  })
})

describe('legend', () => {
  it('labels every key, in Home order', () => {
    expect(MIX_KEYS).toEqual(['new', 'learning', 'due'])
    expect(MIX_KEYS.map(k => MIX_LABELS[k])).toEqual(['New', 'Learning', 'Due'])
  })
})
