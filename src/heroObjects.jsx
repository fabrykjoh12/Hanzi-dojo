import { ON_HERO } from './designTokens'

// Dimensional identity objects for a lit hero panel — P14-5's Tier-1 addition.
//
// Same art direction as the navigation family (navGlyphs.jsx): one light source
// upper-left, dimension from named planes rather than gradients, no raster, no
// blur. Two things are deliberately different, and both follow from where these
// are used:
//
//   1. **They are drawn in PAPER, not in vermilion.** The nav glyphs sit on a
//      neutral tray and are made of brand tones. These sit ON the brand — a
//      vermilion object on a vermilion ground is invisible — so their planes are
//      the hero's own white-alpha ramp. The light source is unchanged; only the
//      material is. `ON_HERO.plane*` names them so they are not three literals
//      scattered through a JSX tree.
//   2. **They are authored at 128, not 32.** A nav glyph has to survive being
//      drawn at 20px, which is why rule 7 there bans details under ~1.4 units. At
//      this size that floor is 0.35 units, so a card can have an actual edge and a
//      stroke can taper. Do NOT reuse these small; the nav family is the small one.
//
// Neither of them is decoration for its own sake: the deck is what the hero is
// about (a queue of cards), and the stroke is the ink the product is made of.

const BOX = 128

function Svg({ size, children, label }) {
  return (
    <svg
      width={size} height={size} viewBox={'0 0 ' + BOX + ' ' + BOX}
      fill="none" aria-hidden="true" focusable="false"
      role={label ? undefined : undefined}
      style={{ display: 'block', flexShrink: 0, pointerEvents: 'none' }}
    >
      {children}
    </svg>
  )
}

// ── The deck ────────────────────────────────────────────────────────────────
// Three cards, fanned on the diagonal, seen from slightly above and to the left.
//
// It is the nav Cards glyph's idea at four times the size, which is what lets it
// be a deck rather than a pair: at 32 units a third card is a 2-unit sliver and
// reads as noise, and here it is 8 and reads as a card. The fan direction and the
// smaller-behind convention are the same, so the two objects are recognisably the
// same family — a learner who has seen the tab knows what this is.
//
// Each card gets a lit top edge and a lit left flank (the L the whole family
// uses), and the two behind it step down a plane each, so the stack reads as
// depth rather than as three outlines.
// `shade` is the correction the hero lab produced: three white-alpha planes on a
// red plate read as frosted GLASS, which the brief rules out. A face darker than
// the ground it sits on is what says "solid", so each card gets a shaded right
// return as well as a lit top-left L — the same two-sided treatment the navigation
// glyphs use, in paper instead of brand tones.
const CARDS = [
  // Furthest back, highest, smallest — and the darkest, because it is deepest in.
  { x: 47, y: 12, w: 52, h: 66, r: 9, face: 'plane3', lit: null, shade: 6 },
  { x: 33, y: 26, w: 56, h: 72, r: 10, face: 'plane2', lit: 'plane1', shade: 7 },
  // Front card: the one the learner is looking at.
  { x: 16, y: 40, w: 60, h: 76, r: 11, face: 'plane1', lit: 'planeLit', shade: 8 },
]

// ⚠️ NO CALL SITE since P14-5C, deliberately. Home's guide does not draw a Cards
// illustration: at Home sizes this deck kept reading as a stack of notes or — with
// a brush mark on it — as the compose/edit glyph, which is the third time that
// misread has appeared in P14. The brief's own instruction was to omit it rather
// than force it, and "professional typography + the story artwork + the numbered
// sequence" is what shipped. Kept as the starting point for the stronger Cards
// identity asset that gets designed on its own.
export function DeckObject({ size = 128 }) {
  return (
    <Svg size={size}>
      {CARDS.map((c) => (
        <g key={c.x}>
          <rect x={c.x} y={c.y} width={c.w} height={c.h} rx={c.r} fill={ON_HERO[c.face]} />
          {/* The right return, in shade — the face pointing away from the light. */}
          <rect
            x={c.x + c.w - c.shade} y={c.y} width={c.shade} height={c.h}
            rx={c.shade / 2} fill={ON_HERO.planeShade}
          />
          {c.lit && (
            <>
              {/* Top edge and left flank — the family's L of light. */}
              <rect x={c.x} y={c.y} width={c.w} height="3.2" rx="1.6" fill={ON_HERO[c.lit]} />
              <rect x={c.x} y={c.y} width="3" height={c.h} rx="1.5" fill={ON_HERO[c.lit]} />
            </>
          )}
        </g>
      ))}
      {/* One brush stroke on the front card, tapered — a 撇, the same mark the nav
          Cards glyph could not afford at 32 units. Here it is 20 units long and
          reads as ink rather than as a pencil. */}
      <path
        d="M56 62 60.5 65.5C52.5 76.5 44 87 34 96.5 37 85 45.5 72.5 56 62Z"
        fill={ON_HERO.planeLit}
      />
    </Svg>
  )
}

// A horizontal brush stroke — 一 — was drawn here too, for the hero variant that
// put an ink mark behind the CTA. It is not shipped: the deck's own 撇 is already
// the hero's ink element, and a second mark on the one object the screen is about
// is the decoration the brief rules out. See docs/BACKLOG.md if a heading ever
// wants one.

// ── The completion seal ───────────────────────────────────────────────────
//
// The one object P14-5C puts on Home, and it appears in exactly one situation:
// the day's training is finished AND something was actually done. A caught-up
// learner who did nothing gets no seal — gold means a reward or an unlock in this
// app (palette.js) and opening the app is neither.
//
// A chop rather than a tick in a circle: a seal is what marks a finished piece of
// work in the tradition the product's identity comes from, and it lets the one
// legitimate use of gold be a thin rule inside the brand red rather than a second
// coloured object competing with it.
//
// Drawn in the LANGUAGE accent, passed in — never a hardcoded red (CLAUDE.md §1).
export function CompletionSeal({ size = 68, accentHex }) {
  const lit = 'color-mix(in srgb, ' + accentHex + ' 62%, var(--surface))'
  return (
    <svg
      width={size} height={size} viewBox="0 0 128 128" fill="none" aria-hidden="true"
      focusable="false" data-completion-seal=""
      style={{ display: 'block', flexShrink: 0, pointerEvents: 'none' }}
    >
      <rect x="18" y="18" width="92" height="92" rx="18" fill={accentHex} />
      {/* The lit top-left face — the same light source as the navigation family. */}
      <path
        d="M18 36C18 26 26 18 36 18H92C102 18 110 26 110 36V44C110 30 98 22 84 22H36C26 22 18 28 18 36Z"
        fill={lit} opacity="0.7"
      />
      <rect x="26" y="26" width="76" height="76" rx="12" fill="none" stroke="var(--gold)" strokeWidth="2" opacity="0.85" />
      <path d="M46 66 58 78 84 50" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}
