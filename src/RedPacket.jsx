import { useId } from 'react'
import { packetFrame } from './redPacketOpen'

// The red packet — Hanzi Dojo's Cards hero object. P14-5E, round 3.
//
// ── The art-direction reset ───────────────────────────────────────────────
//
// Rounds 1 and 2 designed this under the navigation family's constraints, and
// that was the mistake. Those rules exist so a drawing survives being 20px wide:
// flat planes, no cavity, no perspective, silhouette above everything. Applied
// to an object drawn at 118px they produce exactly what the review saw — a large
// flat icon, front-on and symmetrical, with beige tabs behind it.
//
// This is a miniature hero ILLUSTRATION. It keeps the family's palette, its one
// top-left light source and its shape philosophy, and it adds the thing the
// family deliberately does without: space.
//
//   · **Turned about 6°.** Every vertical edge stays vertical and every
//     horizontal one slopes, which is what a Y-rotation does. Nothing here is
//     symmetrical, and the top edge's slope (`SLOPE`) is the one number the
//     whole drawing — cards included — is built from.
//   · **Three planes, not one.** The front face, a side plane turned away from
//     the light, and the up-facing lip of the front wall. A packet with one
//     visible plane is a rectangle.
//   · **A real cavity.** The mouth is a quadrilateral seen from above, filled
//     with a red deeper than any plane, and the front wall casts a hard shadow
//     down into it. This is what makes the cards read as being INSIDE rather
//     than behind.
//   · **The lip occludes the cards.** Their lower halves are cut off by the
//     front wall, in front of them. That single overlap does more for "the cards
//     are in the packet" than any amount of shading.
//   · **Two shadows.** A tight contact shadow directly under the object, and a
//     longer softer one cast down-right away from the light. One blurred blob is
//     the generic look; two shadows that agree about where the light is are not.
//
// ── Restraint, as a list of what is NOT here ──────────────────────────────
// No 福, no coins, no knot tassels, no cloud-scroll pattern, no sparkles, no
// photoreal bevel, no gloss streak, no glow. Every highlight in this file is on
// an edge the geometry says would catch light.

const LIT = 'var(--primary-bright)'
const FACE = 'var(--primary-fill)'
const SHADE = 'var(--primary-pressed)'
// Deeper than any plane: the inside of the packet. `--lacquer-depth` is the
// P14-5D token that already carries a "further into the material" red in both
// themes, so the cavity darkens correctly when the page does.
const DEEP = 'color-mix(in srgb, var(--primary-pressed) 68%, var(--lacquer-depth))'
const DEEPEST = 'color-mix(in srgb, var(--primary-pressed) 38%, var(--lacquer-depth))'
// Antique foil, not bright leaf. `--gold` at full strength on vermilion reads as
// game treasure; knocked back toward the packet's own shade it reads as pressed
// metal, which is the difference between a reward badge and a seal.
const GOLD = 'color-mix(in srgb, var(--gold) 86%, var(--primary-pressed))'
// The rim. Brighter than any plane, because an edge catching light is a
// specular hit rather than a lit surface.
const RIM = 'color-mix(in srgb, #fff 46%, var(--primary-bright))'
// Paper. Mixed rather than taken from a token, because a card must read as paper
// in BOTH themes — `--surface` is warm paper in light and near-black in dark,
// which would turn the cards into holes.
const PAPER = 'color-mix(in srgb, #fff 93%, var(--gold))'
const PAPER_BACK = 'color-mix(in srgb, #fff 78%, var(--gold))'
const PAPER_EDGE = 'color-mix(in srgb, #fff 52%, var(--primary-pressed))'
const INK = 'color-mix(in srgb, var(--primary-pressed) 82%, var(--lacquer-depth))'

const BOX_W = 46
const BOX_H = 74

// The turn. tan(6.4°) — every horizontal edge in the drawing drops by this much
// per unit of width, including the cards', which is why they look like they
// belong in the packet rather than in front of it.
const SLOPE = 0.112

// The front wall, as a quadrilateral. Vertical edges stay vertical; the right
// one is shorter because it is further away.
const XL = 7.2
const XR = 30.4
const LIP_TOP_L = 19.4                       // the up-facing lip's back edge
const LIP_H = 1.6
const FL_TOP = LIP_TOP_L + LIP_H             // where the front FACE starts
const FL_BOT = 65.2
const SHORTEN = 2.3                          // how much the far edge loses, top and bottom
// The side plane, turned away from the light.
const XS = 33.3

// How deep the mouth reads. At rest a packet is nearly shut — the first attempt
// held it 5.2 units open and the cavity drew a black bar across the top of the
// object. D2 sits a little further open because its cards are standing in it.
const REST_DEPTH = { D1: 1.8, D2: 4.4 }
const OPEN_DEPTH = 11.4

function slopeAt(x, yAtXL) {
  return yAtXL + (x - XL) * SLOPE
}

// A quadrilateral whose top and bottom edges follow the packet's turn, and whose
// far (right) edge is `shorten` shorter, split evenly top and bottom.
function turnedQuad(x0, x1, yTop, height, shorten) {
  const t0 = slopeAt(x0, yTop)
  const t1 = slopeAt(x1, yTop) + shorten / 2
  return 'M' + x0 + ' ' + t0.toFixed(2)
    + ' L' + x1 + ' ' + t1.toFixed(2)
    + ' L' + x1 + ' ' + (t1 + height - shorten).toFixed(2)
    + ' L' + x0 + ' ' + (t0 + height).toFixed(2) + ' Z'
}

const FRONT = turnedQuad(XL, XR, FL_TOP, FL_BOT - FL_TOP, SHORTEN)
const SIDE = 'M' + XR + ' ' + slopeAt(XR, FL_TOP + SHORTEN / 2).toFixed(2)
  + ' L' + XS + ' ' + slopeAt(XS, FL_TOP + SHORTEN * 0.95).toFixed(2)
  + ' L' + XS + ' ' + (slopeAt(XS, FL_TOP + SHORTEN * 0.95) + (FL_BOT - FL_TOP) - SHORTEN * 1.9).toFixed(2)
  + ' L' + XR + ' ' + (slopeAt(XR, FL_TOP + SHORTEN / 2) + (FL_BOT - FL_TOP) - SHORTEN).toFixed(2) + ' Z'
// The lip: the top of the front wall, facing up into the light.
const LIP = turnedQuad(XL, XR, LIP_TOP_L, LIP_H, SHORTEN / 2)

// The cavity, and the far wall's own lit top edge. Both depend on how far open
// the packet is, so they are functions rather than constants.
function cavityPath(depth) {
  const backL = LIP_TOP_L - depth
  return 'M' + XL + ' ' + LIP_TOP_L
    + ' L' + XR + ' ' + slopeAt(XR, LIP_TOP_L).toFixed(2)
    + ' L' + (XR + 1.5) + ' ' + slopeAt(XR + 1.5, backL).toFixed(2)
    + ' L' + (XL + 1.5) + ' ' + slopeAt(XL + 1.5, backL).toFixed(2) + ' Z'
}
function backEdgePath(depth) {
  const backL = LIP_TOP_L - depth
  return 'M' + (XL + 1.5) + ' ' + slopeAt(XL + 1.5, backL).toFixed(2)
    + ' L' + (XR + 1.5) + ' ' + slopeAt(XR + 1.5, backL).toFixed(2)
    + ' L' + (XR + 1.5) + ' ' + slopeAt(XR + 1.5, backL - 1.3).toFixed(2)
    + ' L' + (XL + 1.5) + ' ' + slopeAt(XL + 1.5, backL - 1.3).toFixed(2) + ' Z'
}

// ── The cards ─────────────────────────────────────────────────────────────
//
// Two, and everything about them is deliberately unequal: different widths,
// different heights in the packet, different lean, different paper. The one
// thing they share is the packet's own turn, which is what makes them read as
// standing IN it.
// They overlap by about a third. The first attempt overlapped them by half and
// the back card's word was drawn underneath the front card — realistic, and
// unreadable, which is the wrong trade for an object whose whole job is to say
// "these are your cards".
// And they are NARROWER than the packet. The first attempt ran them edge to
// edge, which draws a lid rather than two cards standing in a mouth — a card
// inside an envelope is inset from it, and that inset is most of what says
// "inside".
const CARDS = [
  { x: 9.7, w: 11.4, h: 34, lean: -2.6, word: '你好', tone: PAPER_BACK, restD1: 15.2, restD2: 9.4 },
  { x: 17.8, w: 11.8, h: 34, lean: 1.7, word: '谢谢', tone: PAPER, restD1: 16.8, restD2: 12.2 },
]

function Card({ card, top, rise, tilt, font, showText }) {
  const x0 = card.x
  const x1 = card.x + card.w
  const y = top + rise
  const cx = x0 + card.w / 2
  const cy = slopeAt(cx, y) + card.h * 0.6
  const d = 'M' + x0 + ' ' + slopeAt(x0, y).toFixed(2)
    + ' L' + x1 + ' ' + slopeAt(x1, y).toFixed(2)
    + ' L' + x1 + ' ' + (slopeAt(x1, y) + card.h).toFixed(2)
    + ' L' + x0 + ' ' + (slopeAt(x0, y) + card.h).toFixed(2) + ' Z'
  return (
    <g transform={'rotate(' + (card.lean + tilt).toFixed(2) + ' ' + cx.toFixed(2) + ' ' + cy.toFixed(2) + ')'}>
      <path d={d} fill={card.tone} />
      {/* A hairline down the leading edge only — paper has a thickness, and two
          overlapping cards need it or they read as one wide one. */}
      <path
        d={'M' + x0 + ' ' + slopeAt(x0, y).toFixed(2) + ' L' + x1 + ' ' + slopeAt(x1, y).toFixed(2)
          + ' L' + x1 + ' ' + (slopeAt(x1, y) + card.h).toFixed(2)}
        fill="none" stroke={PAPER_EDGE} strokeWidth="0.42" opacity="0.8"
      />
      {showText && (
        <text
          x={cx} y={slopeAt(cx, y) + 6.6} textAnchor="middle"
          fontFamily={font} fontSize="4.6" fontWeight="600" fill={INK}
          transform={'rotate(' + (SLOPE * 57.3).toFixed(1) + ' ' + cx.toFixed(2) + ' ' + (slopeAt(cx, y) + 6.6).toFixed(2) + ')'}
        >
          {card.word}
        </text>
      )}
    </g>
  )
}

// ── The mark ──────────────────────────────────────────────────────────────
//
// 文 — writing — in one of three treatments. `deboss` is the same red as the
// face, cut into it: the groove's upper-left wall is in shadow and its
// lower-right wall catches light, which is how a blind emboss actually reads and
// why it needs no second colour. `foil` is the same character stamped small in
// antique gold. `none` is a real option and it is not a cop-out — a packet whose
// craft carries it does not need a badge.
function Mark({ x, y, size, kind }) {
  if (kind === 'none') return null
  const u = (fx, fy) => (x + fx * size).toFixed(2) + ' ' + (slopeAt(x + fx * size, y) + fy * size).toFixed(2)
  const strokes = (
    <>
      <path d={'M' + u(0.50, 0.16) + ' L' + u(0.42, 0.28)} />
      <path d={'M' + u(0.16, 0.37) + ' L' + u(0.84, 0.37)} />
      <path d={'M' + u(0.66, 0.46) + ' L' + u(0.22, 0.88)} />
      <path d={'M' + u(0.38, 0.46) + ' L' + u(0.80, 0.88)} />
    </>
  )
  if (kind === 'foil') {
    return (
      <g stroke={GOLD} fill="none" strokeLinecap="round" strokeWidth={size * 0.088}>{strokes}</g>
    )
  }
  return (
    <g fill="none" strokeLinecap="round">
      <g stroke={SHADE} strokeWidth={size * 0.1} opacity="0.85">{strokes}</g>
      <g stroke={RIM} strokeWidth={size * 0.07} opacity="0.4" transform="translate(0.32 0.34)">{strokes}</g>
    </g>
  )
}

// `phase` is milliseconds into the opening gesture (redPacketOpen.js). At 0 the
// packet is at rest, which is what Home renders.
export default function RedPacket({
  direction = 'D2', mark, size = 118, phase = 0, reduced = false, font = 'inherit',
}) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '')
  const ids = { face: 'rp-a-' + raw, lip: 'rp-l-' + raw, cav: 'rp-v-' + raw, cards: 'rp-k-' + raw }
  const frame = packetFrame(phase, { reduced, cards: CARDS.length })
  const open = frame.open
  const dynamic = direction === 'D2'
  const kind = mark || (dynamic ? 'foil' : 'deboss')
  const rest = REST_DEPTH[direction] || REST_DEPTH.D2
  const depth = rest + (OPEN_DEPTH - rest) * open
  const height = size
  const width = Math.round((size * BOX_W) / BOX_H)

  return (
    <span
      aria-hidden="true" data-packet={direction}
      style={{
        display: 'block', flexShrink: 0, width: width + 'px', height: height + 'px',
        // Two shadows, and they agree about the light. A tight contact shadow
        // directly beneath, and a longer softer one thrown down-right away from
        // the top-left source. One generic blur is the look this is escaping.
        filter: 'drop-shadow(0 ' + (2 - frame.lift * 0.5).toFixed(1) + 'px '
          + (2.5 - frame.lift * 0.3).toFixed(1) + 'px color-mix(in srgb, var(--text) 26%, transparent))'
          + ' drop-shadow(' + (3 - frame.lift * 0.2).toFixed(1) + 'px '
          + (9 - frame.lift * 0.9).toFixed(1) + 'px '
          + (13 - frame.lift).toFixed(1) + 'px color-mix(in srgb, var(--text) 15%, transparent))',
        transform: 'translateY(' + frame.lift.toFixed(2) + 'px) scaleY('
          + (1 - frame.compress * 0.045).toFixed(4) + ') scaleX('
          + (1 + frame.compress * 0.022).toFixed(4) + ')',
        transformOrigin: '50% 100%',
        opacity: frame.packetFade,
      }}
    >
      <svg
        width={width} height={height} viewBox={'0 0 ' + BOX_W + ' ' + BOX_H}
        fill="none" focusable="false" style={{ display: 'block', overflow: 'visible' }}
      >
        <defs>
          {/* The face: flat through the middle, turning away only at the very
              bottom. A smooth top-to-bottom fade is an airbrush. */}
          <linearGradient id={ids.face} x1="0.1" y1="0" x2="0.75" y2="1">
            <stop offset="0%" stopColor={LIT} />
            <stop offset="16%" stopColor={FACE} />
            <stop offset="74%" stopColor={FACE} />
            <stop offset="100%" stopColor={SHADE} />
          </linearGradient>
          {/* The lip faces UP, so it is the lightest plane on the object. */}
          <linearGradient id={ids.lip} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={RIM} />
            <stop offset="70%" stopColor={LIT} />
            <stop offset="100%" stopColor={FACE} />
          </linearGradient>
          {/* Inside: darkest at the front, where the front wall's shadow falls,
              lifting a little toward the far wall. */}
          <linearGradient id={ids.cav} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={DEEPEST} />
            <stop offset="100%" stopColor={DEEP} />
          </linearGradient>
          {/* Everything above the lip is visible; everything below it is inside
              the packet and therefore hidden by the front wall. */}
          {/* Everything above the lip is visible; everything below it is inside
              the packet and hidden by the front wall. The cut FOLLOWS the
              packet's turn — the first attempt cut it level, so the cards were
              trimmed along a line the object does not have. */}
          <clipPath id={ids.cards}>
            {/* Open at the top by a full card's height: a card on its way out of
                the packet travels above the viewBox, and a clip that starts at
                y=0 shears its top off mid-gesture. */}
            <path d={'M0 -44 H' + BOX_W + ' V' + slopeAt(BOX_W, LIP_TOP_L + 0.2).toFixed(2)
              + ' L0 ' + slopeAt(0, LIP_TOP_L + 0.2).toFixed(2) + ' Z'} />
          </clipPath>
        </defs>

        {/* 1 · the far wall's own top edge, catching light */}
        <path d={backEdgePath(depth)} fill={LIT} opacity="0.7" />
        {/* 2 · the cavity */}
        <path d={cavityPath(depth)} fill={'url(#' + ids.cav + ')'} />

        {/* 3 · the cards, clipped so nothing below the lip is drawn */}
        <g clipPath={'url(#' + ids.cards + ')'}>
          {CARDS.map((card, i) => (
            <Card
              key={card.x} card={card} font={font}
              top={dynamic ? card.restD2 : card.restD1}
              rise={frame.cards[i].rise}
              tilt={frame.cards[i].tilt}
              showText={dynamic || phase > 0}
            />
          ))}
          {/* The front wall's shadow, thrown back onto whatever is standing in
              the mouth. This is the single mark that makes the cards read as
              being inside rather than propped behind. */}
          <path
            d={turnedQuad(XL - 1, XR + 2, LIP_TOP_L - 3.2, 3.4, 0)}
            fill={DEEPEST} opacity="0.42"
          />
        </g>

        {/* 4 · the side plane, turned away from the light */}
        <path d={SIDE} fill={SHADE} />
        {/* 5 · the front wall's up-facing lip */}
        <path d={LIP} fill={'url(#' + ids.lip + ')'} />
        {/* 6 · the front face */}
        <path d={FRONT} fill={'url(#' + ids.face + ')'} />

        {/* 7 · the near vertical edge, catching the light down its length, and
            the hard line where the front face meets the side plane */}
        <path
          d={'M' + XL + ' ' + slopeAt(XL, FL_TOP).toFixed(2) + ' V' + (slopeAt(XL, FL_TOP) + 26).toFixed(2)}
          stroke={RIM} strokeWidth="0.5" strokeLinecap="round" opacity="0.5"
        />
        <path
          d={'M' + XR + ' ' + slopeAt(XR, FL_TOP + SHORTEN / 2).toFixed(2)
            + ' V' + (slopeAt(XR, FL_TOP + SHORTEN / 2) + (FL_BOT - FL_TOP) - SHORTEN).toFixed(2)}
          stroke={DEEP} strokeWidth="0.4" opacity="0.45"
        />

        {/* 8 · the debossed border a printed packet has. Inset, straight, and it
            is a groove: a dark line with a lit one under it. */}
        <g opacity={dynamic ? 0.55 : 0.75}>
          <path
            d={turnedQuad(XL + 2.3, XR - 2.3, FL_TOP + 3.4, FL_BOT - FL_TOP - 8.4, SHORTEN * 0.7)}
            fill="none" stroke={SHADE} strokeWidth="0.4" opacity="0.5"
          />
          <path
            d={turnedQuad(XL + 2.3, XR - 2.3, FL_TOP + 3.8, FL_BOT - FL_TOP - 8.4, SHORTEN * 0.7)}
            fill="none" stroke={RIM} strokeWidth="0.28" opacity="0.22"
          />
        </g>

        {/* 9 · the mark, low on the face and off-centre — a stamp lands where it
            lands, and dead-centre is the tell of a generated layout. */}
        <Mark x={XL + 8.2} y={FL_BOT - 15.5} size={dynamic ? 7.2 : 8.4} kind={kind} />
      </svg>
    </span>
  )
}
