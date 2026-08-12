// Shared style values for the "one lit panel" design language.
//
// The rules this encodes, so they stay rules rather than one screen's habit:
//   1. Exactly ONE block per screen gets atmosphere. Everything else is flat.
//      Two atmospheric blocks and they start competing.
//   2. Atmosphere stays under ~12% opacity — past that it stops being texture.
//   3. Atmosphere is drawn from the language accent, never photographic, so it
//      cannot clash with a palette it is made of.
//
// Values only (no components), because a .jsx file may export nothing but
// components in this repo — see react-refresh/only-export-components.

import { TYPE } from './typeScale'
import { radius as radiusValue } from './shape'

// The small-caps eyebrow used for every secondary label in the app. One rule,
// applied everywhere, is most of what makes a layout read as authored.
//
// P14-2: DERIVED from TYPE.eyebrow rather than restated, because two spellings
// of one value is exactly the drift this phase exists to remove — and they had
// already been written twice. `lineHeight` is deliberately NOT pulled through:
// MICRO's seven call sites have always inherited theirs, and adding 1.2 would
// move them a fraction of a pixel for no reason. Prefer TYPE.eyebrow in new code.
export const MICRO = {
  fontSize: TYPE.eyebrow.fontSize,
  fontWeight: TYPE.eyebrow.fontWeight,
  letterSpacing: TYPE.eyebrow.letterSpacing,
  textTransform: TYPE.eyebrow.textTransform,
}

// Digits that line up in columns must not shift width as they change.
// Same story: NUMERIC in typeScale.js is the same idea with a weight attached,
// so this stays the bare modifier the existing call sites expect.
export const NUM = { fontVariantNumeric: 'tabular-nums' }

// The deep ground a hero panel sits on: the language's own accent, darkened
// rather than replaced, so every language keeps its identity instead of
// sharing one fixed clay.
export function heroGround(accentHex) {
  return `linear-gradient(160deg,
    color-mix(in srgb, ${accentHex} 88%, #17110E) 0%,
    color-mix(in srgb, ${accentHex} 70%, #17110E) 100%)`
}

// Elevation for a hero panel — tinted by the accent so the cast light matches
// the object casting it, rather than a generic grey drop shadow.
export function heroShadow(accentHex, lifted = false) {
  return lifted
    ? `0 18px 40px -18px color-mix(in srgb, ${accentHex} 70%, transparent)`
    : `0 10px 28px -18px color-mix(in srgb, ${accentHex} 60%, transparent)`
}

// A flat surface panel: themed background, a lit top edge, two-layer shadow.
// Everything that is NOT the hero looks like this.
//
// This IS SURFACE.raised (shape.js) with a lit top edge on it, and it predates
// that name — so rather than introduce a second spelling of the same object,
// P14-2 pointed its radius at the scale. The default was 16 and the four callers
// passed 14, 16, 16 and 20: four values for one object class, which is the drift
// this phase removes. Every flat panel in the app is now `card`.
//
// `radius` stays a parameter because a caller genuinely might need a different
// scale value — but it takes a NAME now, not a number, so a 15 cannot come back.
export function flatPanel({ radius = 'card', padding } = {}) {
  return {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: radiusValue(radius) || radiusValue('card'),
    boxShadow: 'var(--shadow-1), inset 0 1px 0 var(--inset-highlight)',
    padding,
  }
}

// Text colours that read on the hero's deep ground.
export const ON_HERO = {
  eyebrow: 'rgba(255,255,255,0.62)',
  body: 'rgba(255,255,255,0.72)',
  watermark: 'rgba(255,255,255,0.09)',
}
