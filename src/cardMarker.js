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

import { TONE_NEW, TONE_DUE } from './sessionMix'

// The dot on the state pill, matching the header legend's dot exactly — same
// size, same tones — so the pill and the session legend read as one system.
// (The card used to also carry a full-width colour band across its top edge;
// it read as a skeuomorphic "deck edge" on device and is retired — the dot and
// the word carry the fact now.)
export const MARKER_DOT = 7

export function cardMarker(card) {
  const isNew = !!card && card.state === 'new'
  return isNew
    ? { key: 'new', color: TONE_NEW, label: 'New word' }
    : { key: 'due', color: TONE_DUE, label: 'Review' }
}

// The state pill: dot + word, no box. With the strip band retired the pill is
// the card's only state carrier, and a bordered all-caps chip made it the
// loudest thing on an otherwise quiet face — a muted sentence-case label says
// the same fact at conversation volume.
export function markerPillStyle() {
  return {
    display: 'inline-flex', alignItems: 'center', gap: '7px',
    padding: '5px 0',
    color: 'var(--text-muted)',
    fontSize: '12px', fontWeight: 650,
  }
}

export function markerDotStyle(marker) {
  return {
    width: MARKER_DOT + 'px', height: MARKER_DOT + 'px',
    borderRadius: '999px', flexShrink: 0,
    background: marker.color,
  }
}
