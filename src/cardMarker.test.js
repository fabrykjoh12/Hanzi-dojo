import { describe, it, expect } from 'vitest'
import {
  cardMarker, markerPillStyle, markerDotStyle, MARKER_DOT,
} from './cardMarker'
import { TONE_NEW, TONE_DUE } from './sessionMix'

describe('cardMarker', () => {
  it('marks a new card as a first meeting', () => {
    const marker = cardMarker({ state: 'new' })
    expect(marker.key).toBe('new')
    expect(marker.label).toBe('New word')
    expect(marker.color).toBe(TONE_NEW)
  })

  it('marks every seen state as a review', () => {
    for (const state of ['learning', 'relearning', 'review']) {
      const marker = cardMarker({ state })
      expect(marker.key).toBe('due')
      expect(marker.label).toBe('Review')
      expect(marker.color).toBe(TONE_DUE)
    }
  })

  it('falls back to review for legacy rows with no state', () => {
    expect(cardMarker({}).label).toBe('Review')
    expect(cardMarker({ state: null }).label).toBe('Review')
    expect(cardMarker(null).label).toBe('Review')
    expect(cardMarker(undefined).label).toBe('Review')
  })

  // The front of a card must never hint that a word is one you keep failing —
  // that biases the recall attempt. Lapses, leech flags and difficulty must
  // make no difference to what the marker says.
  it('never leaks a struggling signal', () => {
    const struggled = { state: 'relearning', lapses: 14, is_leech: true, difficulty: 9.8 }
    const calm = { state: 'relearning', lapses: 0 }
    expect(cardMarker(struggled)).toEqual(cardMarker(calm))
  })

  it('only ever produces two distinct markers', () => {
    const states = ['new', 'learning', 'relearning', 'review', undefined, null, 'weird']
    const labels = new Set(states.map(state => cardMarker({ state }).label))
    expect(labels.size).toBe(2)
  })
})

describe('markerPillStyle', () => {
  // The pill is the non-colour carrier of the signal, so its own neutrals must
  // theme — no raw hexes, or it goes unreadable in dark mode. It is plain text
  // now (no box): the dot and the word at conversation volume.
  it('uses semantic tokens and carries no box of its own', () => {
    const style = markerPillStyle()
    expect(style.color).toBe('var(--text-muted)')
    expect(style.background).toBeUndefined()
    expect(style.border).toBeUndefined()
    expect(JSON.stringify(style)).not.toContain('#')
  })
})

describe('markerDotStyle', () => {
  it('carries the marker tone at the same size as the header legend dot', () => {
    expect(markerDotStyle(cardMarker({ state: 'new' })).background).toBe(TONE_NEW)
    expect(markerDotStyle(cardMarker({ state: 'review' })).background).toBe(TONE_DUE)
    expect(markerDotStyle(cardMarker({ state: 'new' })).width).toBe(MARKER_DOT + 'px')
  })
})
