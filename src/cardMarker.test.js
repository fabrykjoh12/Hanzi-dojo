import { describe, it, expect } from 'vitest'
import {
  cardMarker, markerStripShadow, markerCardShadow,
  markerPillStyle, markerDotStyle,
  MARKER_HEIGHT, MARKER_EDGE, MARKER_DOT,
} from './cardMarker'
import { TONE_NEW, TONE_DUE } from './sessionMix'

describe('cardMarker', () => {
  it('marks a new card as first time', () => {
    const marker = cardMarker({ state: 'new' })
    expect(marker.key).toBe('new')
    expect(marker.label).toBe('FIRST TIME')
    expect(marker.color).toBe(TONE_NEW)
  })

  it('marks every seen state as a review', () => {
    for (const state of ['learning', 'relearning', 'review']) {
      const marker = cardMarker({ state })
      expect(marker.key).toBe('due')
      expect(marker.label).toBe('REVIEW')
      expect(marker.color).toBe(TONE_DUE)
    }
  })

  it('falls back to review for legacy rows with no state', () => {
    expect(cardMarker({}).label).toBe('REVIEW')
    expect(cardMarker({ state: null }).label).toBe('REVIEW')
    expect(cardMarker(null).label).toBe('REVIEW')
    expect(cardMarker(undefined).label).toBe('REVIEW')
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

describe('markerStripShadow', () => {
  it('draws a band of the marker tone at the full marker height', () => {
    const shadow = markerStripShadow(cardMarker({ state: 'new' }))
    expect(shadow).toContain('inset 0 ' + MARKER_HEIGHT + 'px 0 0 ' + TONE_NEW)
  })

  it('closes the band with a themed edge one pixel below it', () => {
    const shadow = markerStripShadow(cardMarker({ state: 'review' }))
    expect(shadow).toContain('inset 0 ' + (MARKER_HEIGHT + MARKER_EDGE) + 'px 0 0 var(--border)')
  })

  it('is thick enough to read at a glance', () => {
    expect(MARKER_HEIGHT).toBeGreaterThanOrEqual(6)
  })

  it('gives the two states different bands', () => {
    expect(markerStripShadow(cardMarker({ state: 'new' })))
      .not.toBe(markerStripShadow(cardMarker({ state: 'review' })))
  })
})

describe('markerCardShadow', () => {
  it('keeps the ambient lift on a themed token and paints the band over it', () => {
    const shadow = markerCardShadow(cardMarker({ state: 'new' }))
    expect(shadow.indexOf('var(--shadow-2)')).toBe(0)
    expect(shadow).toContain(markerStripShadow(cardMarker({ state: 'new' })))
  })
})

describe('markerPillStyle', () => {
  // The pill is the non-colour carrier of the signal, so its own neutrals must
  // theme — no raw hexes, or it goes unreadable in dark mode.
  it('uses semantic tokens for every neutral', () => {
    const style = markerPillStyle()
    expect(style.background).toBe('var(--surface-2)')
    expect(style.border).toBe('1px solid var(--border)')
    expect(style.color).toBe('var(--text-muted)')
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
