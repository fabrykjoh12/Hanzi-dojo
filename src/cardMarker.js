// The front-of-card status marker: is the word in front of me a first-time
// card, or one I have seen before?
//
// Deliberately only TWO states, and only ever those two. The marker is shown
// BEFORE the answer, so it must never hint that a word is one you keep
// failing — that would bias the recall attempt. The struggling signal lives in
// the leech panel, which is answer-side only.
//
// The colours come from sessionMix.js, so the study header's rail bands and
// this marker are one palette rather than two vocabularies for one fact.
//
// Pure: no React, no Supabase. Study.jsx renders what this returns.

import { TONE_NEW, TONE_DUE, HUE_NEW, HUE_DUE } from './sessionMix'

// The strip across the top of the card. It was 3px, which on a phone reads as
// a rendering artefact rather than a signal — the whole point of it is that
// "new or review?" lands in the first glance, before you start recalling. 8px
// is thick enough to be a deliberate band and still quiet: it is a band, not a
// dashboard (calm, not pressured).
export const MARKER_HEIGHT = 8

// A 1px themed line closing the band off from the card face. Both tones are
// pale, and TONE_DUE especially would otherwise bleed into a light surface;
// the edge gives the band a defined bottom in both themes without touching the
// tones themselves.
export const MARKER_EDGE = 1

// The dot on the state pill, matching the header legend's dot exactly — same
// size, same tones — so the pill and the session legend read as one system.
export const MARKER_DOT = 7

export function cardMarker(card) {
  const isNew = !!card && card.state === 'new'
  return isNew
    ? { key: 'new', color: TONE_NEW, hue: HUE_NEW, label: 'FIRST TIME' }
    : { key: 'due', color: TONE_DUE, hue: HUE_DUE, label: 'REVIEW' }
}

// The band's colour, and the one place the light/dark difference lives.
//
// It used to be the raw tone. That is correct for the dot beside the label —
// a small mark, and a pale mark on a dark ground is exactly right — but the
// band is 8px of the card's full width, and at that size a pale colour is not
// a mark at all: it is a second surface, lit, sitting on top of a dark one. A
// device found it, and it is precisely what CLAUDE.md §5 means by a tint that
// must mix into its surface instead of being laid over it.
//
// So the band is now the marker's hue mixed into `--surface` by the theme's
// `--card-strip-mix`: 55% on white paper, which reproduces the old tone to the
// byte, and 32% on a dark card, which turns the same colour into a quiet band
// of that card. One expression, two themes — the `ink()` pattern, in reverse.
export function markerStripTint(marker) {
  return 'color-mix(in srgb, ' + marker.hue + ' var(--card-strip-mix), var(--surface))'
}

// The band is drawn as stacked inset shadows rather than an absolutely
// positioned element so it follows the card's border radius for free and can
// never overlap the card's own header row.
export function markerStripShadow(marker) {
  return 'inset 0 ' + MARKER_HEIGHT + 'px 0 0 ' + markerStripTint(marker)
    + ', inset 0 ' + (MARKER_HEIGHT + MARKER_EDGE) + 'px 0 0 var(--border)'
}

// The card's full box-shadow: ambient lift first, then the band on top.
export function markerCardShadow(marker) {
  return 'var(--shadow-2), ' + markerStripShadow(marker)
}

// The state pill. It used to be tinted and lettered in the marker colour,
// which put TONE_DUE cream text on a cream tint — the label, the part that
// actually carries the meaning, was the least readable thing on the card. Now
// the band carries the colour and the pill carries the words, on neutral
// tokens that theme correctly. Two carriers, neither shouting over the other.
export function markerPillStyle() {
  return {
    display: 'inline-flex', alignItems: 'center', gap: '7px',
    padding: '5px 11px', borderRadius: '999px',
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    color: 'var(--text-muted)',
    fontSize: '11px', fontWeight: 800, letterSpacing: '0.04em',
  }
}

export function markerDotStyle(marker) {
  return {
    width: MARKER_DOT + 'px', height: MARKER_DOT + 'px',
    borderRadius: '999px', flexShrink: 0,
    background: marker.color,
  }
}
