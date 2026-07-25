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

// The small-caps eyebrow used for every secondary label in the app. One rule,
// applied everywhere, is most of what makes a layout read as authored.
export const MICRO = {
  fontSize: '10.5px', fontWeight: 800, letterSpacing: '0.14em',
  textTransform: 'uppercase',
}

// Digits that line up in columns must not shift width as they change.
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

// A flat surface panel: themed background, hairline top edge, two-layer
// shadow. Everything that is NOT the hero looks like this.
export function flatPanel({ radius = 16, padding } = {}) {
  return {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: radius + 'px',
    boxShadow: 'var(--shadow-1), inset 0 1px 0 var(--hairline)',
    padding,
  }
}

// Text colours that read on the hero's deep ground.
export const ON_HERO = {
  eyebrow: 'rgba(255,255,255,0.62)',
  body: 'rgba(255,255,255,0.72)',
  watermark: 'rgba(255,255,255,0.09)',
}
