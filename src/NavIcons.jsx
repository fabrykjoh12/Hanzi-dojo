// The bottom navigation's own icon family.
//
// Why these are not lucide, and not a second icon package either:
//
// Two of the five had to be drawn by hand whatever else happened. There is no
// library glyph for "flashcards" — every candidate is a stack, a layer or a
// duplicate — and Practice needs to read as a set of drills rather than a
// bullseye, which is a metaphor about aiming, not practising. Once Cards and
// Practice are custom, taking the other three from a library means matching
// somebody else's optical weight, corner radius and how a filled variant is
// derived, across five glyphs sitting 60px apart on the same row. That is
// exactly where a mismatch shows.
//
// So this is one family with one set of rules, and it is a small file:
//
//   · 24×24 viewBox, every glyph optically centred inside 3.4–20.6
//   · one outline weight; Cards is drawn a touch heavier because it is primary
//   · 2.2–2.4 corner radius on every rectangular form
//   · round caps and joins throughout
//   · the filled variant is the SAME path filled, plus a hairline of the same
//     colour — a filled shape reads optically smaller than the outline it
//     replaces, and the hairline is what keeps the two states the same size
//
// Only the bottom bar uses these. The rest of the app is lucide and stays
// lucide (CLAUDE.md §2); this is a five-glyph family for one surface, not a
// migration.

const OUTLINE = 1.8
// Cards only: larger AND slightly heavier, because position alone was not doing
// enough on a real phone. Still one step, not a shout.
const OUTLINE_STRONG = 1.9
// The filled states' compensating hairline (see above).
const FILLED_EDGE = 1.15

function Glyph({ size, children, strong }) {
  return (
    <svg
      className="hd-tab-icon"
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="none"
      strokeWidth={strong ? OUTLINE_STRONG : OUTLINE}
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false"
    >
      {children}
    </svg>
  )
}

// Shared by every glyph: outline draws the path, active fills it and adds the
// hairline. One rule, so no glyph can drift into its own idea of "filled".
function skin(active, color) {
  return active
    ? { fill: color, stroke: color, strokeWidth: FILLED_EDGE }
    : { fill: 'none', stroke: color }
}

// ── Practice ──────────────────────────────────────────────────────────────
// Four modules in a 2×2. The old bullseye said "goal"; Practice is a shelf of
// drills, and a small grid of generously-rounded tiles says shelf. Kept to four
// equal forms so it survives 22px without turning to mush.
const TILE = [[3.6, 3.6], [12.8, 3.6], [3.6, 12.8], [12.8, 12.8]]

export function PracticeIcon({ size = 22, active = false, color = 'currentColor' }) {
  const s = skin(active, color)
  return (
    <Glyph size={size}>
      {TILE.map(([x, y]) => (
        <rect key={x + '-' + y} x={x} y={y} width="7.6" height="7.6" rx="2.2" {...s} />
      ))}
    </Glyph>
  )
}

// ── Home ──────────────────────────────────────────────────────────────────
// A roof, a body and a doorway — and the doorway is not decoration. Filled, the
// silhouette on its own is a pentagon: it reads as a shield or a location pin,
// not a house. The door is the one detail that keeps it a house at 22px in both
// states, so it is in both states.
//
// Home is the default landing tab, which is a routing fact. It must not also be
// the loudest shape on the bar.
const HOUSE = 'M3.6 10.3 12 3.6l8.4 6.7v8.1a1.9 1.9 0 0 1-1.9 1.9H5.5a1.9 1.9 0 0 1-1.9-1.9Z'
const DOOR = 'M9.9 20.3v-4.5a2.1 2.1 0 0 1 4.2 0v4.5'

export function HomeIcon({ size = 22, active = false, color = 'currentColor' }) {
  // Filled, the door becomes a hole in the same shape rather than a line on top
  // of it — one path, even-odd, so it cannot drift out of register.
  if (active) {
    return (
      <Glyph size={size}>
        <path d={HOUSE + ' ' + DOOR + 'Z'} fillRule="evenodd"
          fill={color} stroke={color} strokeWidth={FILLED_EDGE} />
      </Glyph>
    )
  }
  return (
    <Glyph size={size}>
      <path d={HOUSE} fill="none" stroke={color} />
      <path d={DOOR} fill="none" stroke={color} />
    </Glyph>
  )
}

// ── Cards ─────────────────────────────────────────────────────────────────
// Two overlapping flashcards. The one glyph in the set that had to be drawn
// rather than found, and three things make it a deck instead of the
// copy/duplicate icon every library already ships:
//
//   · the back card is SMALLER than the front one — a stack seen slightly from
//     above, not a rectangle pasted twice
//   · both are landscape, not square; a square reads as a tile, and Practice is
//     already made of tiles
//   · the back card is drawn only where it is actually visible, so no line
//     crosses another. That is the difference between an icon and a diagram at
//     this size.
//
// The face is deliberately blank. A single stroke on the front card was drawn
// and rendered — the intended "there is a word on it" cue — and at 25px it
// reads unmistakably as a minus sign, i.e. as a remove button. The overlap is
// what carries the meaning; anything inside the card fights it.
const CARD_BACK_OUTLINE =
  'M8.2 10.4V5.6a2.2 2.2 0 0 1 2.2-2.2h8a2.2 2.2 0 0 1 2.2 2.2v4.6a2.2 2.2 0 0 1-2.2 2.2h-1.6'
// Filled, the back card stops 1.3–1.6 short of the front one on both edges, so
// the two stay two cards instead of fusing into one slab.
const CARD_BACK_FILLED =
  'M10.4 3.4h8a2.2 2.2 0 0 1 2.2 2.2v4.6a2.2 2.2 0 0 1-2.2 2.2V9.1H8.2V5.6a2.2 2.2 0 0 1 2.2-2.2Z'

export function CardsIcon({ size = 25, active = false, color = 'currentColor' }) {
  const s = skin(active, color)
  return (
    <Glyph size={size} strong>
      <path d={active ? CARD_BACK_FILLED : CARD_BACK_OUTLINE} {...s} />
      {/* Landscape, not square: a square reads as a tile, and Practice is
          already made of tiles. */}
      <rect x="3" y="10.4" width="13.8" height="10.2" rx="2.4" {...s} />
    </Glyph>
  )
}

// ── Stories ───────────────────────────────────────────────────────────────
// An open book: two pages and the spine between them. Symmetric, where Cards is
// diagonal — the two have to be tellable apart at a glance and at speed, and
// silhouette is what does that, not detail.
const PAGE_L = 'M12 7.3c-1.9-1.7-4.4-2.5-7-2.4H3.9a.9.9 0 0 0-.9.9v10.9a.9.9 0 0 0 .9.9H5c2.6-.1 5.1.7 7 2.4'
const PAGE_R = 'M12 7.3c1.9-1.7 4.4-2.5 7-2.4h1.1a.9.9 0 0 1 .9.9v10.9a.9.9 0 0 1-.9.9H19c-2.6-.1-5.1.7-7 2.4'
const SPINE = 'M12 7.3v13.7'
// Filled: the same two pages as solids, parted at the spine so the book stays a
// book rather than closing into a slab.
const PAGE_L_FILLED = 'M11.2 7.6c-2-1.7-4.5-2.5-7.2-2.4a1 1 0 0 0-1 1v10.7a1 1 0 0 0 1 1c2.7-.1 5.2.7 7.2 2.4Z'
const PAGE_R_FILLED = 'M12.8 7.6c2-1.7 4.5-2.5 7.2-2.4a1 1 0 0 1 1 1v10.7a1 1 0 0 1-1 1c-2.7-.1-5.2.7-7.2 2.4Z'

export function StoriesIcon({ size = 22, active = false, color = 'currentColor' }) {
  if (active) {
    return (
      <Glyph size={size}>
        <path d={PAGE_L_FILLED} fill={color} stroke={color} strokeWidth={FILLED_EDGE} />
        <path d={PAGE_R_FILLED} fill={color} stroke={color} strokeWidth={FILLED_EDGE} />
      </Glyph>
    )
  }
  return (
    <Glyph size={size}>
      <path d={PAGE_L} fill="none" stroke={color} />
      <path d={PAGE_R} fill="none" stroke={color} />
      <path d={SPINE} fill="none" stroke={color} />
    </Glyph>
  )
}

// ── More ──────────────────────────────────────────────────────────────────
// Three dots, and the only glyph with no outline state: a hollow dot is a
// bubble, not a dot. More is utility navigation and is meant to be the quietest
// thing on the bar, so it gains weight only when it is the thing you are on.
export function MoreIcon({ size = 22, active = false, color = 'currentColor' }) {
  const r = active ? 1.85 : 1.55
  return (
    <Glyph size={size}>
      {[5.7, 12, 18.3].map((cx) => (
        <circle key={cx} cx={cx} cy="12" r={r} fill={color} stroke="none" />
      ))}
    </Glyph>
  )
}
