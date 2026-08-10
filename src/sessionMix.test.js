import { describe, it, expect } from 'vitest'
import {
  sessionMix, mixKey, bandTone,
  TONE_NEW, TONE_LEARNING, TONE_DUE, HUE_NEW, HUE_DUE, MIX_KEYS, MIX_LABELS,
} from './sessionMix'

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

describe('bandTone', () => {
  it('uses the language accent for completed work', () => {
    expect(bandTone('#B83A24', 'done')).toBe('#B83A24')
    expect(bandTone('#2563C9', 'done')).toBe('#2563C9')
  })

  // The whole point of the palette: a band is the same colour as the marker
  // line across the top of the card it stands for. If these drift apart, the
  // rail and the card are telling the learner two different things.
  it('matches the card marker colours for new and due', () => {
    expect(bandTone('#B83A24', 'new')).toBe('#7FA0B5')
    expect(bandTone('#B83A24', 'due')).toBe('#E4DCCB')
  })

  it('does not tint the card tones with the accent', () => {
    expect(bandTone('#B83A24', 'new')).toBe(bandTone('#2563C9', 'new'))
    expect(bandTone('#B83A24', 'due')).toBe(bandTone('#2E3A6E', 'due'))
  })

  it('places learning midway between first-time and review', () => {
    expect(TONE_LEARNING).toBe('color-mix(in srgb, ' + TONE_NEW + ' 50%, ' + TONE_DUE + ')')
    expect(bandTone('#B83A24', 'learning')).toBe(TONE_LEARNING)
  })

  it('gives every legend key a tone', () => {
    for (const key of MIX_KEYS) expect(bandTone('#B83A24', key)).toBeTruthy()
  })

  it('falls back to the due tone for an unknown key', () => {
    expect(bandTone('#B83A24', 'nonsense')).toBe(TONE_DUE)
  })
})

// The hues exist so the card's 8px band can be a tint of the card instead of a
// pale bar laid over it (see cardMarker.js). The contract that keeps light mode
// exactly as it was: each tone IS its hue on white paper, at the light theme's
// mix. If that stops holding, the light-mode card changed colour.
describe('the card hues behind the tones', () => {
  const LIGHT_MIX = 0.55   // --card-strip-mix in :root

  const rgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  // What color-mix(in srgb, hue P%, #FFFFFF) resolves to, rounded as a browser
  // rounds it to an 8-bit channel.
  const onWhite = (hex, p) => rgb(hex).map(c => Math.round(p * c + (1 - p) * 255))

  it('reproduces the first-time tone exactly, on white', () => {
    expect(onWhite(HUE_NEW, LIGHT_MIX)).toEqual(rgb(TONE_NEW))
  })

  it('reproduces the review tone exactly, on white', () => {
    expect(onWhite(HUE_DUE, LIGHT_MIX)).toEqual(rgb(TONE_DUE))
  })

  it('keeps the two hues distinguishable rather than two shades of one', () => {
    expect(HUE_NEW).not.toBe(HUE_DUE)
    const [r1, g1, b1] = rgb(HUE_NEW)
    const [r2, g2, b2] = rgb(HUE_DUE)
    expect(Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2)).toBeGreaterThan(120)
  })

  it('is a hue, not a pastel — it has somewhere to go on a dark card', () => {
    // A near-neutral hue mixes into any surface as grey. These have chroma.
    for (const hex of [HUE_NEW, HUE_DUE]) {
      const [r, g, b] = rgb(hex)
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeGreaterThan(40)
    }
  })
})

describe('legend', () => {
  it('labels every key, in Home order', () => {
    expect(MIX_KEYS).toEqual(['new', 'learning', 'due'])
    expect(MIX_KEYS.map(k => MIX_LABELS[k])).toEqual(['New', 'Learning', 'Due'])
  })
})
