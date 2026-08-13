import { useId } from 'react'
import { packetFrame } from './redPacketOpen'

// The red packet — Hanzi Dojo's Cards hero object. P14-5E, round 2.
//
// The learner's day of cards is waiting inside a 红包, and starting Study is
// opening it. It replaces the navigation Cards glyph on Home's active step:
// that glyph is a good ICON and a generic OBJECT — two rounded rectangles are
// what every app in the store draws — and Home's one dimensional object is the
// place the product can look like itself.
//
// ── What round 1 got wrong, and what changed ──────────────────────────────
//
// Round 1 was rejected as AI slop, and the diagnosis was right. Five faults,
// each with a fix, and all of them are about CRAFT rather than about the idea:
//
//   1. **Over-rounded.** A 2.6-unit corner on a 33-wide packet is a 8% radius —
//      moulded plastic. It is 1.4 now, which is a paper fold with a crease
//      knocked off it. Nothing in the object is rounder than 1.6.
//   2. **The flap bowed.** A curved fold is the single most blob-making line
//      available; it read as a ribbon draped over the front. Every fold in this
//      file is STRAIGHT.
//   3. **No rim, and no print.** Illustrated objects read as premium because
//      their lit edge is a hard highlight rather than the top of a gradient, and
//      because they carry the details a manufactured thing would have. There is
//      a 0.6-unit rim light on the top and left edges now, fading out down the
//      side, and a debossed border 2.4 in from the edge — the two changes that
//      do most of the work in this rework.
//   4. **Three fanned cards.** Three of anything, fanned, is a card game. Two,
//      staggered, is a deck someone put in an envelope.
//   5. **The ensō.** A brushed circle is Zen, which is Japanese-coded, on an
//      object that is specifically Chinese. It is a square seal now, with 文 —
//      "writing" — stamped in relief: the right tradition, the right word for
//      this product, and legible at 16px where a brushed ring was a letter C.
//
// ── It still obeys the icon family ────────────────────────────────────────
// navGlyphs.jsx wrote the art direction down: one light source upper left, the
// three brand tones plus at most one accent, silhouette first, not one hardcoded
// colour. The family's ban on gradients is scoped to 20px glyphs ("a gradient at
// 20px is mud"); this draws at 116px, where the object needs two flat planes and
// one soft turn, which is what it has.
//
// ── Restraint, as a list of what is NOT here ──────────────────────────────
// No 福, no coins, no knot tassels, no cloud-scroll pattern, no sparkles, no
// photoreal bevel, no gloss streak. Gold appears once per concept, at 17px.

const LIT = 'var(--primary-bright)'
const FACE = 'var(--primary-fill)'
const SHADE = 'var(--primary-pressed)'
// Antique foil, not bright leaf. `--gold` at full strength on vermilion reads as
// game treasure; knocked back toward the packet's own shade it reads as pressed
// metal, which is the difference between a reward badge and a seal.
const GOLD = 'color-mix(in srgb, var(--gold) 86%, var(--primary-pressed))'
// The rim. Brighter than any plane, because an edge catching light is a
// specular hit rather than a lit surface — this is the line that separates
// "illustrated object" from "rounded rectangle with a gradient".
const RIM = 'color-mix(in srgb, #fff 46%, var(--primary-bright))'
// Warm ivory for a card face. Mixed rather than a token, because a card inside
// the packet must read as PAPER in both themes — `--surface` is warm paper in
// light and near-black in dark, which would turn the cards into holes.
const PAPER = 'color-mix(in srgb, #fff 91%, var(--gold))'
const PAPER_SHADE = 'color-mix(in srgb, #fff 72%, var(--gold))'
const PAPER_EDGE = 'color-mix(in srgb, #fff 55%, var(--primary-pressed))'

// 0.577 — a real 红包's proportion. Round 1 was 0.71, which is a soap bar.
const BOX_W = 35
const BOX_H = 62
const BODY = { x: 2.5, y: 6, width: 30, height: 52, rx: 1.4 }
const R = BODY.rx
const X0 = BODY.x
const X1 = BODY.x + BODY.width
const Y0 = BODY.y
const Y1 = BODY.y + BODY.height

// The fold, straight, a third of the way down. Where a real packet's flap is
// glued when it is folded over the front.
const FOLD_Y = 18.6

// Two cards, staggered rather than fanned: the back one further left and
// higher, the front one lower and turned the other way, each protruding a
// different amount. Two objects at two depths is a deck; three at even spacing
// is a card game.
// Believable means barely turned. Round 2's first draft splayed them -4.5° and
// +3° and they read as two sheets someone had shoved in at angles; a deck put in
// an envelope sits almost straight, and the stagger does the work.
const CARDS = [
  { x: 6.8, y: -1.2, width: 14.4, height: 24, rx: 0.7, rest: -1.6, tone: PAPER_SHADE },
  { x: 13.2, y: 1.4, width: 14.8, height: 24, rx: 0.7, rest: 1.2, tone: PAPER },
]

function Defs({ ids }) {
  return (
    <defs>
      {/* Two planes and one soft turn: the face is FLAT through the middle
          three-quarters and the light falls off only at the very bottom, where
          the object turns away. A smooth top-to-bottom fade is an airbrush, and
          an airbrushed red rectangle is exactly the generated look. */}
      <linearGradient id={ids.body} x1="0.12" y1="0" x2="0.62" y2="1">
        <stop offset="0%" stopColor={LIT} />
        <stop offset="14%" stopColor={FACE} />
        <stop offset="72%" stopColor={FACE} />
        <stop offset="100%" stopColor={SHADE} />
      </linearGradient>
      {/* The flap is a second sheet lying ON the first, so it is a touch lighter
          across its whole face and it casts a hard line where it ends. */}
      <linearGradient id={ids.flap} x1="0.12" y1="0" x2="0.5" y2="1">
        <stop offset="0%" stopColor={LIT} />
        <stop offset="34%" stopColor={FACE} />
        <stop offset="100%" stopColor={FACE} />
      </linearGradient>
      {/* The rim fades out rather than stopping. A highlight that ends at a
          hard point mid-edge is not an edge catching light, it is a scratch —
          which is exactly what round 2's first render drew down the left side. */}
      <linearGradient id={ids.rim} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={RIM} stopOpacity="0.95" />
        <stop offset="55%" stopColor={RIM} stopOpacity="0.35" />
        <stop offset="100%" stopColor={RIM} stopOpacity="0" />
      </linearGradient>
      <clipPath id={ids.clip}><rect {...BODY} /></clipPath>
    </defs>
  )
}

// The seal: a foil square with 文 — "writing" — stamped in relief.
//
// Two things this went through, both worth keeping written down:
//
//   · **Filled, then relief.** The first drafts filled the square with gold and
//     knocked the character out of it. At 16px a solid gold chip is the loudest
//     thing on the screen, which is the opposite of "a subtle square seal". In
//     relief the mark is a line drawing, and a line drawing stays sharp small.
//   · **日, then 文.** 日 is literally a rectangle inside a rectangle, so inside
//     a square seal it drew three nested boxes and read as a digital 8. 文 is
//     four strokes in a cross, it cannot be confused with its own frame, and it
//     is the better word anyway: this is an app about 汉字.
function Seal({ x, y, size = 9 }) {
  const u = (fx, fy) => (x + fx * size).toFixed(2) + ' ' + (y + fy * size).toFixed(2)
  return (
    <g stroke={GOLD} fill="none" strokeLinecap="round">
      <rect x={x} y={y} width={size} height={size} rx="0.4" strokeWidth={size * 0.055} />
      <g strokeWidth={size * 0.085}>
        <path d={'M' + u(0.50, 0.17) + ' L' + u(0.43, 0.27)} />
        <path d={'M' + u(0.20, 0.36) + ' L' + u(0.80, 0.36)} />
        <path d={'M' + u(0.64, 0.44) + ' L' + u(0.24, 0.82)} />
        <path d={'M' + u(0.40, 0.44) + ' L' + u(0.78, 0.82)} />
      </g>
    </g>
  )
}

function Card({ card, tilt, rise, opacity }) {
  const cx = card.x + card.width / 2
  const cy = card.y + card.height
  return (
    <g
      opacity={opacity}
      transform={'translate(0 ' + rise.toFixed(2) + ') rotate(' + tilt.toFixed(2) + ' ' + cx + ' ' + cy + ')'}
    >
      <rect x={card.x} y={card.y} width={card.width} height={card.height} rx={card.rx} fill={card.tone} />
      {/* One hairline down the leading edge, so two overlapping cards read as
          two sheets rather than as one wide one. */}
      <rect
        x={card.x} y={card.y} width={card.width} height={card.height} rx={card.rx}
        fill="none" stroke={PAPER_EDGE} strokeWidth="0.5" opacity="0.75"
      />
    </g>
  )
}

// `phase` is milliseconds into the opening gesture (redPacketOpen.js). At 0 the
// packet is closed and at rest, which is what Home renders.
export default function RedPacket({
  concept = 'C', size = 116, phase = 0, reduced = false, cards = true,
}) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '')
  const ids = { body: 'hdrp-b-' + raw, flap: 'hdrp-f-' + raw, clip: 'hdrp-c-' + raw, rim: 'hdrp-r-' + raw }
  const frame = packetFrame(phase, { reduced, cards: CARDS.length })
  const opening = phase > 0
  // C is the pocket: no flap over the front, cards standing in the mouth. A and
  // B are closed, and only show cards once the gesture has started.
  const pocket = concept === 'C'
  const showCards = cards && (pocket || opening)
  const height = size
  const width = Math.round((size * BOX_W) / BOX_H)
  // A closed packet opens its flap; the pocket tips its mouth toward you a
  // little instead, which is the same beat doing the same job on a different
  // construction.
  const flapAngle = pocket ? frame.flapAngle * 0.22 : frame.flapAngle

  return (
    <span
      aria-hidden="true" data-packet={concept}
      style={{
        display: 'block', flexShrink: 0, width: width + 'px', height: height + 'px',
        // Contact shadow. Not `boxShadow` — the object is a silhouette, not a
        // box, and a rectangular shadow under an envelope is the fastest way to
        // make a drawn object look pasted on. Tight and low: a packet lying on a
        // page casts a short shadow, and a long one reads as levitation.
        filter: 'drop-shadow(0 ' + (4 + -frame.lift * 0.8).toFixed(1)
          + 'px ' + (7 + -frame.lift * 1.1).toFixed(1)
          + 'px color-mix(in srgb, var(--text) 20%, transparent))',
        transform: 'translateY(' + frame.lift.toFixed(2) + 'px)',
        opacity: frame.packetFade,
      }}
    >
      <svg
        width={width} height={height} viewBox={'0 0 ' + BOX_W + ' ' + BOX_H}
        fill="none" focusable="false"
        style={{
          display: 'block', overflow: 'visible',
          // Without perspective, `rotateX` is an orthographic squash: the flap
          // appears to shrink upward rather than to swing away from the viewer.
          perspective: '260px', transformStyle: 'preserve-3d',
        }}
      >
        <Defs ids={ids} />

        {/* Behind the front panel: the cards. Drawn first so the packet's own
            body covers their lower two-thirds, which is what "inside" means. */}
        {showCards && (
          <g>
            {CARDS.map((card, i) => (
              <Card
                key={card.x} card={card}
                rise={opening ? frame.cards[i].rise : 0}
                tilt={opening ? card.rest + frame.cards[i].tilt : card.rest}
                opacity={!opening || pocket ? 1 : frame.cards[i].opacity}
              />
            ))}
          </g>
        )}

        <g
          style={{
            transformOrigin: (BOX_W / 2) + 'px ' + Y0 + 'px',
            transform: 'rotateX(' + (pocket ? flapAngle : 0).toFixed(1) + 'deg)',
            transformBox: 'view-box',
          }}
        >
          {/* The body. One plane. */}
          <rect {...BODY} fill={'url(#' + ids.body + ')'} />

          {/* The rim: the top edge and the top of the left edge catching the
              light. Drawn as one path stroked with a fading gradient, so the
              highlight dies out down the side instead of stopping. */}
          <path
            d={'M' + X0 + ' ' + (Y0 + 22)
              + ' V' + (Y0 + R) + ' A' + R + ' ' + R + ' 0 0 1 ' + (X0 + R) + ' ' + Y0
              + ' H' + (X1 - R) + ' A' + R + ' ' + R + ' 0 0 1 ' + X1 + ' ' + (Y0 + R)
              + ' V' + (Y0 + 9)}
            fill="none" stroke={'url(#' + ids.rim + ')'} strokeWidth="0.6" strokeLinecap="round"
          />

          <g clipPath={'url(#' + ids.clip + ')'}>
            {concept === 'A' && (
              <>
                {/* The flap: a second sheet lying on the first, ending in a
                    STRAIGHT fold with a hard shadow beneath it. */}
                <rect x={X0} y={Y0} width={BODY.width} height={FOLD_Y - Y0} rx={R}
                  fill={'url(#' + ids.flap + ')'} />
                <rect x={X0} y={FOLD_Y - R} width={BODY.width} height={R + 0.2}
                  fill={'url(#' + ids.flap + ')'} />
                <rect x={X0} y={FOLD_Y} width={BODY.width} height="1.5" fill={SHADE} opacity="0.62" />
                <rect x={X0} y={FOLD_Y + 1.5} width={BODY.width} height="1.6" fill={SHADE} opacity="0.26" />
              </>
            )}
            {pocket && (
              <>
                {/* The mouth: the top edge of the pocket the cards stand in, with
                    its own shade falling inward. */}
                <rect x={X0} y={Y0} width={BODY.width} height="1.1" fill={RIM} opacity="0.45" />
                <rect x={X0} y={Y0 + 1.1} width={BODY.width} height="1.3" fill={SHADE} opacity="0.3" />
              </>
            )}

            {/* The foot: the plane at the bottom turning further from the light.
                A straight band, not a curve. */}
            <rect x={X0} y={Y1 - 5.5} width={BODY.width} height="5.5" fill={SHADE} opacity="0.32" />

            {/* A debossed border, 2.4 in from the edge — the detail a printed
                packet actually has, and the one that most separates "designed
                object" from "red rectangle". It is a groove, so it is drawn as a
                dark line with a lit line under it, the same construction as the
                lacquer button's lower edge. */}
            <rect
              x={X0 + 2.4} y={(pocket ? Y0 + 4.6 : FOLD_Y + 3.2)} width={BODY.width - 4.8}
              height={Y1 - 2.6 - (pocket ? Y0 + 4.6 : FOLD_Y + 3.2)} rx="0.7"
              fill="none" stroke={SHADE} strokeWidth="0.42" opacity="0.42"
            />
            <rect
              x={X0 + 2.4} y={(pocket ? Y0 + 4.6 : FOLD_Y + 3.2) + 0.42} width={BODY.width - 4.8}
              height={Y1 - 2.6 - (pocket ? Y0 + 4.6 : FOLD_Y + 3.2)} rx="0.7"
              fill="none" stroke={RIM} strokeWidth="0.3" opacity="0.18"
            />
          </g>

          {/* The seal. One per packet, always the same size, always foil. */}
          {concept === 'A' && <Seal x={BOX_W / 2 - 4.5} y={FOLD_Y + 8} />}
          {concept === 'B' && <Seal x={BOX_W / 2 - 5.8} y={25} size={11.6} />}
          {concept === 'C' && <Seal x={BOX_W / 2 - 4.5} y={34} />}
        </g>
      </svg>
    </span>
  )
}
