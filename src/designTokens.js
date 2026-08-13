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
// Text colours that read on the hero's deep ground.
export const ON_HERO = {
  eyebrow: 'rgba(255,255,255,0.62)',
  body: 'rgba(255,255,255,0.72)',
  watermark: 'rgba(255,255,255,0.09)',
  // ── The hero's material ramp (P14-5) ──────────────────────────────────────
  // A dimensional object ON the brand cannot be made OF the brand — a vermilion
  // card on a vermilion ground is a rumour. So the hero's identity objects
  // (heroObjects.jsx) are built from paper at four strengths, which is the same
  // technique the navigation glyphs use with brand tones: one light source upper
  // left, dimension from named planes, no gradients.
  //
  // White on an accent is the one hardcode CLAUDE.md §5 permits, and these are
  // named here rather than typed into a JSX tree so the ramp stays a ramp.
  planeLit: 'rgba(255,255,255,0.30)',   // faces up / up-left
  plane1: 'rgba(255,255,255,0.17)',     // faces the viewer
  plane2: 'rgba(255,255,255,0.10)',     // a plane back
  plane3: 'rgba(255,255,255,0.055)',    // deepest, and the atmospheric mark
  // The one plane that is DARKER than the ground. Without it the objects read as
  // frosted glass — measured in the P14-5 hero lab, three white-alpha planes on a
  // red plate look like panes, not like cards. A face darker than what it sits on
  // is what says "solid".
  planeShade: 'rgba(23,17,14,0.20)',
  // The lit top edge of the hero panel itself — the same hairline the floating
  // navigation tray uses, for the same reason: the top of a lifted object catches
  // the light. Stronger than the tray's because this ground is far darker.
  litEdge: 'rgba(255,255,255,0.13)',
  // The pool of light at the hero's top-left corner. Stronger than a plane
  // because it IS the light, not a surface catching it.
  facet: 'rgba(255,255,255,0.16)',
}

// The lit hero's ground — a MATERIAL, not a gradient for its own sake (P14-5).
//
// Three things it is doing, and each is answering something the P14-5 brief named:
//
//   1. **The hue lifts per theme.** `heroHue()` is the language accent mixed
//      toward `--hero-lift` by `--hero-lift-pct` — 0% in light, so light mode's
//      hero is byte-identical to what shipped before, and 38% toward a warm
//      saturated orange-red in dark, which lands #B83A24 at #D3583A: the brief's
//      "#E4573A-family, saturated". NOT `ink()`, which mixes toward white and
//      turns a large red surface dusty pink (measured: #CD7566).
//   2. **The light comes from the top left**, like everything else in the app
//      since P14-3. 158° puts the gradient's bright end at the top-left corner,
//      and `HeroPanel` adds the actual lit facet on top of it.
//   3. **The far end darkens toward a per-theme depth.** #17110E on paper; a
//      warmer, lighter #24120C in dark, because darkening a panel toward
//      near-black on a #100D0E page makes its bottom edge merge with the page it
//      is supposed to be floating on.
//
// The three stops rather than two are what stop it reading as a generic AI
// gradient: a flat plane catching light has a bright end, a long true-colour
// middle where the accent actually IS the accent, and a shaded far end. Two stops
// is a wash from A to B with no material in between.
//
// ⚠️ `material` is the same migration seam `HeroPanel` carries, for the same
// reason, and it is why these functions take it at all. FOUR screens draw a hero
// — Home, Stories, Practice, Profile — and three of them are frozen. P14-5 first
// shipped the new ground unconditionally, which restyled all four; CI caught it
// as an 8,168-pixel diff on the `stories-shelf-mobile` baseline, and the baseline
// was right. `wash` is therefore the pre-P14-5 ground, byte-identical, and
// `facet` is Home's. When a later phase moves those screens over, the default
// flips and the parameter goes away.
export function heroHue(accentHex) {
  return `color-mix(in srgb, ${accentHex}, var(--hero-lift) var(--hero-lift-pct))`
}

export function heroGround(accentHex, material = 'wash') {
  if (material !== 'facet') {
    return `linear-gradient(160deg,
    color-mix(in srgb, ${accentHex} 88%, #17110E) 0%,
    color-mix(in srgb, ${accentHex} 70%, #17110E) 100%)`
  }
  const hue = heroHue(accentHex)
  return `linear-gradient(158deg,
    color-mix(in srgb, ${hue} 94%, var(--hero-depth)) 0%,
    color-mix(in srgb, ${hue} 82%, var(--hero-depth)) 52%,
    color-mix(in srgb, ${hue} 62%, var(--hero-depth)) 100%)`
}

// Elevation for a hero panel — tinted by the accent so the cast light matches
// the object casting it, rather than a generic grey drop shadow.
export function heroShadow(accentHex, lifted = false, material = 'wash') {
  // A `facet` hero also gets a lit top edge, the same hairline the floating
  // navigation tray wears and for the same reason: the top of a lifted object
  // catches the light. On the hero it is stronger than on the tray because this
  // ground is far darker. Same seam as above — a frozen screen's shadow is
  // unchanged.
  const edge = material === 'facet' ? ', inset 0 1px 0 ' + ON_HERO.litEdge : ''
  return (lifted
    ? `0 18px 40px -18px color-mix(in srgb, ${accentHex} 70%, transparent)`
    : `0 10px 28px -18px color-mix(in srgb, ${accentHex} 60%, transparent)`) + edge
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

