import { ON_HERO } from './designTokens'

// Home's hero — the pure half. P14-5F.
//
// The Cards step is the screen's one lit panel again, and everything about it
// that is a VALUE rather than a drawing lives here: the type stack, the tighter
// radii, the CTA's two shadow states, the flashcard geometry. Tested, so the
// approved render has a contract and a later edit cannot quietly change it.

// ── The type stack ────────────────────────────────────────────────────────
//
// Named once, applied at Home's root and nowhere else. Mona Sans is approved for
// HOME; the app-wide rollout is a separate phase, and until then every other
// screen names 'Inter' itself (~298 sites) and is unaffected.
//
// Inter is second on purpose rather than only `sans-serif`: Cyrillic has no Mona
// subset (monaSans.css), so a frozen track's Home falls through to the face the
// rest of the app already uses instead of to a system default.
export const HOME_FONT_STACK = "'Mona Sans', 'Inter', system-ui, sans-serif"

// ── Shape ─────────────────────────────────────────────────────────────────
//
// The tighter pair, approved for Home: controls 12 → 10, content cards 18 → 16.
//
// It is HERE and not in `shape.js` for one honest reason. `RADIUS` is the app's
// scale and `shape.test.js` pins its five names; promoting this pair means
// re-radiusing every screen in one owned sweep, which is a phase of its own and
// is explicitly out of scope for a migration told to change Home only. So the
// values are named, documented and tested here, scoped to the one screen that
// was approved with them. When the sweep happens, this constant is what it
// deletes.
export const HOME_RADIUS = {
  control: 10,
  card: 16,
}

// ── The primary action's material ─────────────────────────────────────────
//
// Cream paper on the brand red, and the press is not a transform alone: the
// object settles INTO the shadow it casts. Two states, one function, because the
// difference between them is the whole point and a reviewer should be able to
// read it in one place.
//
//   rest      a hairline contact shadow, a soft cast onto the panel, a dark
//             lower edge (paper has thickness) and a lit top edge.
//   pressed   the soft cast is GONE. The hairline and both edges stay, so the
//             control keeps its material while losing its height.
//
// Values are `ON_HERO.planeShade` throughout — the one plane in the ramp that is
// darker than the ground. A generic rgba shadow here would be invisible on the
// red (the P14-2 finding that produced the ELEVATION tokens).
export function heroCtaShadow({ pressed = false } = {}) {
  const edges = 'inset 0 -1px 0 ' + ON_HERO.planeShade + ', inset 0 1px 0 #fff'
  if (pressed) return '0 1px 2px ' + ON_HERO.planeShade + ', ' + edges
  return '0 1px 2px ' + ON_HERO.planeShade
    + ', 0 5px 14px -8px ' + ON_HERO.planeShade
    + ', ' + edges
}

// Geometry, in one place so the control's parts cannot drift apart. The arrow
// zone is full-height and shares the button's radius minus its own inset — a
// keycap set into the face, which is what stopped it reading as a second
// circular button pasted inside the first.
export const HERO_CTA = {
  height: 50,          // inside the brief's 50-52 band, and clears TAP_MIN
  inset: 4,            // the paper border around the keycap
  arrowWidth: 46,
  get arrowRadius() { return HOME_RADIUS.control - this.inset },
}

// ── The flashcard object ──────────────────────────────────────────────────
//
// Two translucent sheets behind, one solid paper card in front. The hierarchy is
// MATERIAL, not detail: the front card is real paper with the word printed in
// the brand's ink, which is what separates a flashcard from the abstract paper
// rectangles that read as "a stack of notes" three times in P14.
//
// Nothing here is symmetrical. Unequal tilts, unequal sizes, unequal offsets —
// three cards at 0° are a printer tray.
export const FLASHCARD_BOX = 128

export const FLASHCARD_SHEETS = [
  { x: 47, y: 10, w: 50, h: 64, r: 6, face: 'plane3', lit: null, tilt: 4 },
  { x: 33, y: 22, w: 54, h: 70, r: 6.5, face: 'plane2', lit: 'plane1', tilt: -3 },
]

export const FLASHCARD_FRONT = { x: 14, y: 36, w: 60, h: 76, r: 7, tilt: -8 }

// The paper and the ink. Mixed rather than tokened, because a card on the hero
// must read as paper in BOTH themes — `--surface` is warm paper in light and
// near-black in dark, which would turn the front card into a hole.
export const FLASHCARD_INK = {
  paper: 'color-mix(in srgb, #fff 94%, var(--gold))',
  edge: 'color-mix(in srgb, #fff 68%, var(--primary-pressed))',
  word: 'var(--primary-pressed)',
  reading: 'color-mix(in srgb, var(--primary-pressed) 60%, #fff)',
}

// ── The panel's material ──────────────────────────────────────────────────
//
// The corner light is the SAME token at two radii — a wide wash plus a tighter
// core — so the corner reads stronger without a brighter value being invented.
// The lower-right steps into shade. The grain is the only number here a device
// pass might want to move: 0.04 is felt as paper, and the instruction if it ever
// reads as noise is to reduce it, never to raise it.
export const HERO_GRAIN_OPACITY = 0.04

export function heroCornerLight() {
  return 'radial-gradient(closest-side, ' + ON_HERO.facet + ' 0%, transparent 100%),'
    + 'radial-gradient(46% 52% at 14% 4%, ' + ON_HERO.facet + ' 0%, transparent 78%)'
}

export function heroFarShade() {
  return 'radial-gradient(85% 75% at 100% 105%, ' + ON_HERO.planeShade + ' 0%, transparent 62%)'
}
