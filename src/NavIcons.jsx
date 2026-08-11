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
//   · one outline weight, with two documented exceptions below
//   · 1.8–2.5 corner radius on every rectangular form
//   · round caps and joins throughout
//   · the filled variant is the SAME path filled, plus a hairline of the same
//     colour — a filled shape reads optically smaller than the outline it
//     replaces, and the hairline is what keeps the two states the same size
//
// Only the bottom bar uses these. The rest of the app is lucide and stays
// lucide (CLAUDE.md §2); this is a five-glyph family for one surface, not a
// migration.
//
// Sizes live in navEmphasis.js, with the ink measurements that chose them.
import { useId } from 'react'
import { NAV_ICON_PX } from './navEmphasis'

const OUTLINE = 1.8
// Cards only: larger AND slightly heavier, because position alone was not doing
// enough on a real phone. Still one step, not a shout.
const OUTLINE_STRONG = 1.9
// Practice only, and the second half of the same finding: four forms at 1.8 out-
// inked every other glyph on the bar, Cards included. A drill shelf should not
// be the loudest thing here.
const OUTLINE_LIGHT = 1.65
// The filled states' compensating hairline (see above).
const FILLED_EDGE = 1.15

function Glyph({ size, children, weight }) {
  return (
    <svg
      className="hd-tab-icon"
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="none"
      strokeWidth={weight || OUTLINE}
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
// equal forms so it survives 21px without turning to mush.
//
// Quieted deliberately, and this is the one glyph on the bar whose numbers were
// chosen by measurement rather than by eye: at 7.6 tiles and the shared 1.8
// stroke it carried 158px² of ink against Cards' 147, so the drawer read louder
// than the daily action. Smaller tiles, a wider gap and a lighter stroke bring
// it to ~100 — below Home and Stories, where a drawer belongs — while the
// silhouette stays four tiles rather than four dots.
const TILE_SIDE = 6.0
// Half the gap at the centre lines, so the grid stays centred on 12 by
// construction: tiles span 4.75–19.25 instead of 3.6–20.4.
const TILE_GAP = 1.25
const TILE_NEAR = 12 - TILE_GAP - TILE_SIDE
const TILE_FAR = 12 + TILE_GAP
const TILE = [
  [TILE_NEAR, TILE_NEAR], [TILE_FAR, TILE_NEAR],
  [TILE_NEAR, TILE_FAR], [TILE_FAR, TILE_FAR],
]

export function PracticeIcon({ size = NAV_ICON_PX.practice, active = false, color = 'currentColor' }) {
  const s = skin(active, color)
  return (
    <Glyph size={size} weight={OUTLINE_LIGHT}>
      {TILE.map(([x, y]) => (
        <rect key={x + '-' + y} x={x} y={y} width={TILE_SIDE} height={TILE_SIDE} rx="1.8" {...s} />
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

export function HomeIcon({ size = NAV_ICON_PX.home, active = false, color = 'currentColor' }) {
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
// Two flashcards, one behind the other. The one glyph in the set that had to be
// drawn rather than found, and the one that has been drawn twice.
//
// The first version hand-authored the occlusion: the back card was an open path
// that traced only the edges the front card does not cover. It was correct and
// it read, on a phone, as two abstract rounded rectangles — i.e. as the
// copy/duplicate icon every library ships. Three things were wrong with it, and
// all three are geometry:
//
//   · the two cards were nearly the same size, so neither was obviously in front
//   · the offset was up-and-right, which leaves the back card's LEFT edge
//     visible as well; the visible outline became a full hook, which is a
//     second complete rectangle
//   · the gap between the two cards was authored by hand, and stroke width is
//     not free — a 1.9 stroke with round caps eats ~1px at every end, so the
//     gap that looked right in the path data closed up in the render
//
// So the occlusion is done by MASK now. The back card is a COMPLETE rounded
// rect, and the front card's silhouette — grown by exactly `CARDS_GAP` plus
// whatever the front card's own stroke happens to be in this state — is
// subtracted from it. Three consequences worth having:
//
//   · the band of background between the two cards is 1.0 units wide
//     everywhere, in both states, by construction rather than by arithmetic
//   · no line crosses another, and none can: the mask is what guarantees it
//   · outline and filled are now the SAME two rects, differing only in fill and
//     stroke. The family rule finally applies to this glyph too — it used to be
//     the one exception, carrying two hand-tuned back-card paths.
//
// PORTRAIT, and this is the change that made it read: the flashcard in the app
// is portrait, a playing card is portrait, and the previous landscape pair had
// nothing to distinguish it from two stacked tiles. The offset is up-and-right
// and small — the back card peeks, it does not fan.
//
// The faces are deliberately blank. A single stroke on the front card was drawn
// and rendered — the intended "there is a word on it" cue — and at this size it
// reads unmistakably as a minus sign, i.e. as a remove button. The overlap is
// what carries the meaning; anything inside the card fights it.
const CARDS_FRONT = { x: 3.4, y: 5.6, w: 12.4, h: 15, rx: 2.5 }
const CARDS_BACK = { x: 9.4, y: 3.4, w: 11.2, h: 12.4, rx: 2.2 }
const CARDS_GAP = 1

export function CardsIcon({ size = NAV_ICON_PX.study, active = false, color = 'currentColor' }) {
  // One mask per rendered icon. `useId` because the bar is not the only place
  // that can mount one — the tour and the tutorial both render chrome — and two
  // masks sharing an id is the kind of bug that only shows up on the screen
  // nobody screenshotted.
  const maskId = 'hd-cards-' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const s = skin(active, color)
  // The erased band: the gap on both sides of the front card's edge, plus the
  // width of the stroke that edge is actually drawn with in this state.
  const cut = 2 * CARDS_GAP + (active ? FILLED_EDGE : OUTLINE_STRONG)
  return (
    <Glyph size={size} weight={OUTLINE_STRONG}>
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect width="24" height="24" fill="#FFFFFF" />
        <rect
          x={CARDS_FRONT.x} y={CARDS_FRONT.y}
          width={CARDS_FRONT.w} height={CARDS_FRONT.h} rx={CARDS_FRONT.rx}
          fill="#000000" stroke="#000000" strokeWidth={cut}
        />
      </mask>
      <g mask={'url(#' + maskId + ')'}>
        <rect
          x={CARDS_BACK.x} y={CARDS_BACK.y}
          width={CARDS_BACK.w} height={CARDS_BACK.h} rx={CARDS_BACK.rx}
          {...s}
        />
      </g>
      <rect
        x={CARDS_FRONT.x} y={CARDS_FRONT.y}
        width={CARDS_FRONT.w} height={CARDS_FRONT.h} rx={CARDS_FRONT.rx}
        {...s}
      />
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

export function StoriesIcon({ size = NAV_ICON_PX.stories, active = false, color = 'currentColor' }) {
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
// thing on the bar, so it gains weight only when it is the thing you are on —
// and it is the one tab drawn a step smaller than the reference pair, with the
// dots pulled in slightly so the trio reads as one mark rather than three.
export function MoreIcon({ size = NAV_ICON_PX.more, active = false, color = 'currentColor' }) {
  const r = active ? 1.8 : 1.5
  return (
    <Glyph size={size}>
      {[5.9, 12, 18.1].map((cx) => (
        <circle key={cx} cx={cx} cy="12" r={r} fill={color} stroke="none" />
      ))}
    </Glyph>
  )
}
