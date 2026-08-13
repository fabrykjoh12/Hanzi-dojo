import { useId } from 'react'
import { packetFrame } from './redPacketOpen'

// The red packet — Hanzi Dojo's Cards hero object. P14-5E.
//
// The learner's day of cards is waiting inside a 红包, and starting Study is
// opening it. It replaces the navigation Cards glyph on the active step: that
// glyph is a good ICON and a generic OBJECT — two rounded rectangles are what
// every app in the store draws for "cards" — and Home's one dimensional object
// is the place the product can look like itself.
//
// ── It obeys the icon family, at hero scale ───────────────────────────────
// navGlyphs.jsx wrote the art direction down and this follows it:
//
//   · ONE light source, upper left. Every lit plane faces up-and-left.
//   · The three brand tones and at most one accent. --primary-bright /
//     --primary-fill / --primary-pressed, plus --gold, and not one hardcoded
//     colour in the file. All four already lift correctly for dark mode.
//   · The silhouette is the object. A closed portrait envelope, corners eased.
//     No pattern, no lantern, no coin, no cartoon.
//   · Dimension comes from planes.
//
// The ONE rule it breaks, deliberately: the family bans gradients, and its stated
// reason is legibility — "a gradient at 20px is mud". This object is drawn at 96
// to 132px, where a gradient is not mud but the difference between paper and
// lacquer, and it is the same material the P14-5D lacquer button is made of. A
// packet built from three flat planes at this size looks like a flag.
//
// ── Restraint, as a list of what is NOT here ──────────────────────────────
// No lucky-money clipart, no 福, no coins, no knot tassels, no cloud scroll
// pattern, no sparkles, no photoreal plastic bevel. Gold appears in exactly one
// place per concept and is a hairline or a small mark, never a field.

const LIT = 'var(--primary-bright)'
const FACE = 'var(--primary-fill)'
const SHADE = 'var(--primary-pressed)'
const GOLD = 'var(--gold)'
// Warm ivory for a card face. Mixed rather than a token, because a card inside
// the packet must read as PAPER in both themes — `--surface` is warm paper in
// light and near-black in dark, which would turn the cards into holes.
const PAPER = 'color-mix(in srgb, #fff 88%, var(--gold))'
const PAPER_EDGE = 'color-mix(in srgb, #fff 62%, var(--primary-pressed))'

// Portrait, at a real 红包's proportion. The first draft was 44 × 62 — 0.71 — and
// at that ratio, with a 4.2 corner, it drew a soap bar. A packet is narrow: this
// is 0.61 and the corners are 2.6, which is paper folded, not moulded plastic.
const BOX_W = 38
const BOX_H = 62

// The body is the silhouette. Everything else sits on it.
const BODY = { x: 2.5, y: 7, width: 33, height: 51, rx: 2.6 }
// The flap's lower edge dips a little in the middle — the single line that
// separates an envelope from a rounded rectangle. The first draft dipped 6 units
// and, with a gold hairline along it, read as a RIBBON draped across the front.
// It dips 2 now, and no gold follows it.
const FLAP_BOW = 'V20.4 Q19 22.6 2.5 20.4 Z'
const FLAP = 'M2.5 9.6 A2.6 2.6 0 0 1 5.1 7 H32.9 A2.6 2.6 0 0 1 35.5 9.6 ' + FLAP_BOW
// The band of shade the flap casts on the body directly beneath it. This, not a
// line, is what makes the flap read as a plane in front of another plane.
const FLAP_SHADOW = 'M2.5 20.4 Q19 22.6 35.5 20.4 V23.4 Q19 25.6 2.5 23.4 Z'

// Three cards standing in the packet's mouth. Only the top of each is ever
// visible; the rest is behind the front panel.
//
// They OVERLAP, and that is the whole difference between a deck and a row of
// sticky notes. The first draft set three separate rectangles side by side with
// clear air between them, which is the shape of paper TABS — a filing system,
// not a hand of cards. Overlapping them by half shows three leading edges, which
// is what a deck looks like from the front.
const CARDS = [
  { x: 4.6, y: 1.4, width: 13, height: 22, rx: 0.9 },
  { x: 12.5, y: -0.6, width: 13, height: 24, rx: 0.9 },
  { x: 20.4, y: 1.4, width: 13, height: 22, rx: 0.9 },
]

function Defs({ ids }) {
  return (
    <defs>
      {/* Lacquer: lit at the top-left corner, a FLAT face through the middle,
          the plane turning away at the bottom-right.
          The flat middle is the point. A smooth top-to-bottom fade is an
          airbrush, and an airbrushed red rectangle is exactly the "AI-rendered
          plastic" the brief rules out — so the light turns quickly at each end
          and the object's face is one honest tone. */}
      <linearGradient id={ids.body} x1="0" y1="0" x2="0.62" y2="1">
        <stop offset="0%" stopColor={LIT} />
        <stop offset="20%" stopColor={FACE} />
        <stop offset="76%" stopColor={FACE} />
        <stop offset="100%" stopColor={SHADE} />
      </linearGradient>
      {/* The flap is a second plane, tilted further toward the light, so it
          separates from the body by TONE rather than by a drawn line. */}
      {/* Only the top edge catches the light. A flap filled edge to edge with
          `--primary-bright` splits the object into two colours in dark mode,
          where that token lifts hardest — the shadow beneath the fold is what
          separates the planes, not a brighter fill. */}
      <linearGradient id={ids.flap} x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0%" stopColor={LIT} />
        <stop offset="46%" stopColor={FACE} />
        <stop offset="100%" stopColor={FACE} />
      </linearGradient>
      <clipPath id={ids.body + '-clip'}>
        <rect {...BODY} />
      </clipPath>
    </defs>
  )
}

// The mark: Hanzi Dojo's ensō, the same open brushed circle as the app icon,
// pressed into the packet in foil. Not a 福, not a coin — the product's own mark
// is the only thing on a red envelope that could not have come from a stock pack.
function Enso({ cx, cy, r, stroke = GOLD, width = 2 }) {
  // The gap is where the brush lifts. The first draft opened it 0.62 radians
  // wide and the mark read as a letter C — the app icon's ensō is very nearly
  // closed, and that is what makes it a circle with a breath in it rather than
  // an arc.
  const gap = 0.3
  const a0 = -Math.PI * 0.36 + gap
  const a1 = a0 + Math.PI * 2 - gap * 2
  const p = (a) => (cx + r * Math.cos(a)).toFixed(2) + ' ' + (cy + r * Math.sin(a)).toFixed(2)
  return (
    <path
      d={'M' + p(a0) + ' A' + r + ' ' + r + ' 0 1 1 ' + p(a1)}
      fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round"
      transform={'rotate(-14 ' + cx + ' ' + cy + ')'}
    />
  )
}

function Card({ rect, tilt = 0, rise = 0, opacity = 1 }) {
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height
  return (
    <g
      opacity={opacity}
      transform={'translate(0 ' + rise.toFixed(2) + ') rotate(' + tilt.toFixed(2) + ' ' + cx + ' ' + cy + ')'}
    >
      <rect {...rect} fill={PAPER} />
      <rect {...rect} fill="none" stroke={PAPER_EDGE} strokeWidth="0.7" />
    </g>
  )
}

// `phase` is milliseconds into the opening gesture (redPacketOpen.js). At 0 the
// packet is closed and at rest, which is what Home renders.
export default function RedPacket({
  concept = 'A', size = 108, phase = 0, reduced = false, cards = true,
}) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '')
  const ids = { body: 'hdrp-b-' + raw, flap: 'hdrp-f-' + raw }
  const frame = packetFrame(phase, { reduced, cards: CARDS.length })
  const opening = phase > 0
  // B stands its cards up in the mouth of the packet at rest; A and C are closed,
  // and only show cards once the gesture has started.
  const stands = concept === 'B' || concept === 'D'
  const showCards = cards && (stands || opening)
  const height = size
  const width = Math.round((size * BOX_W) / BOX_H)

  return (
    <span
      aria-hidden="true" data-packet={concept}
      style={{
        display: 'block', flexShrink: 0, width: width + 'px', height: height + 'px',
        // Contact shadow. Not `boxShadow` — the object is a silhouette, not a box,
        // and a rectangular shadow under a rounded envelope is the single fastest
        // way to make a drawn object look pasted on.
        filter: 'drop-shadow(0 ' + (6 + -frame.lift * 0.9).toFixed(1)
          + 'px ' + (9 + -frame.lift).toFixed(1)
          + 'px color-mix(in srgb, var(--text) 17%, transparent))',
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
          perspective: '240px', transformStyle: 'preserve-3d',
        }}
      >
        <Defs ids={ids} />

        {/* Behind the front panel: the cards. Drawn first so the packet's own
            body covers their lower half, which is what "inside" means. */}
        {showCards && (
          <g>
            {CARDS.map((rect, i) => (
              <Card
                key={rect.x} rect={rect}
                rise={opening ? frame.cards[i].rise : 0}
                tilt={opening ? frame.cards[i].tilt : (i - 1) * 4}
                // B's cards are already standing in the mouth at rest, so they
                // must not fade IN — the fan's opacity ramp is for the concepts
                // that were closed, and applying it to B made the cards blink
                // out of existence on the first frame of the gesture.
                opacity={!opening || stands ? 1 : frame.cards[i].opacity}
              />
            ))}
          </g>
        )}

        {/* The body. Its top edge is the packet's mouth. */}
        <rect {...BODY} fill={'url(#' + ids.body + ')'} />

        {/* The flap, hinged on its own top edge so it turns away from the viewer
            exactly where a real one is glued. */}
        <g
          style={{
            transformOrigin: '19px 7px',
            transform: 'rotateX(' + (-frame.flapAngle).toFixed(1) + 'deg)',
            transformBox: 'view-box',
          }}
        >
          <path d={FLAP} fill={'url(#' + ids.flap + ')'} />
          {stands && (
            // The gold budget for a packet with an open mouth: a hairline along the mouth the cards stand
            // in. Short of the corners, so it reads as an embossed crease rather
            // than as a band wrapped round the object.
            <path
              d="M7 20.2 Q19 21.9 31 20.2" fill="none" stroke={GOLD}
              strokeWidth="0.55" opacity="0.7"
            />
          )}
          {concept === 'A' && (
            <>
              {/* The foil seal, where a real packet is closed. A disc of foil
                  with the ensō pressed into it — the first draft was a plain
                  gold dot on a curved line and read as the clasp on a handbag. */}
              <circle cx="19" cy="21.6" r="4.6" fill={SHADE} opacity="0.45" />
              <circle cx="19" cy="21.2" r="4.6" fill={GOLD} />
              <Enso cx={19} cy={21.2} r={2.4} width={0.9} stroke={SHADE} />
            </>
          )}
        </g>

        {!stands && <path d={FLAP_SHADOW} fill={SHADE} opacity="0.5" />}
        {stands && (
          // A packet with cards standing in it has no flap shadow — the flap is
          // folded BEHIND, which is what lets
          // the cards stand in the mouth — so the mouth itself gets the shade.
          <path d="M2.5 20.4 Q19 22.6 35.5 20.4 V22.2 Q19 24.4 2.5 22.2 Z" fill={SHADE} opacity="0.4" />
        )}

        {(concept === 'C' || concept === 'D') && (
          <g clipPath={'url(#' + ids.body + '-clip)'}>
            {/* The mark, pressed into the body below the fold. Larger than A's
                seal and quieter than it — an outline, not a disc. */}
            <Enso cx={19} cy={concept === 'D' ? 40 : 38.5} r={concept === 'D' ? 6.4 : 7.2} width={1.9} />
            {/* And the deeper construction the concept asks for: the plane at the
                foot of the packet turning further away from the light. */}
            <path d="M2.5 50 Q19 53.4 35.5 50 V58 H2.5 Z" fill={SHADE} opacity="0.45" />
          </g>
        )}
      </svg>
    </span>
  )
}
