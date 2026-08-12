import { useId } from 'react'

// Hanzi Dojo's dimensional icon family — P14-3.
//
// Six glyphs, and they are the REFERENCE FAMILY: every future custom identity icon
// copies these rules rather than inventing its own. So the rules are written down
// here, not inferred from the drawings.
//
// FIVE of them are the production navigation — Home · Stories · Cards · Practice ·
// More, which is the bar exactly as it ships. The sixth, Profile, is an identity
// icon for the place Profile already lives; it is NOT a sixth tab and swapping it
// for More would be a navigation change, which this phase is not. navGlyphFamily.js
// keeps the two sets apart so nothing can quietly install Profile on the bar.
//
// This file does NOT replace NavIcons.jsx. That is the flat outline/filled family
// the bottom bar ships today, tuned by ink measurement in P8, and P14-3 is
// explicitly not allowed to touch the bar. These are evaluated in the /dev
// gallery (NavGlyphGallery.jsx) first; P14-4 is where the tray and its icons
// change together.
//
// ── The art direction, as constraints ───────────────────────────────────────
// Vermilion ink × warm paper × dimensional learning objects.
//
//   1. **One light source: upper left.** Every lit plane faces up-and-left, every
//      shaded plane faces down-and-right. No glyph gets its own lighting.
//   2. **Three brand tones and at most one accent.** The tones are not new
//      values — they are `--primary-bright` / `--primary-fill` /
//      `--primary-pressed`, which P14-0 already defines and which already lift
//      correctly for dark mode. There is not one hardcoded colour in this file.
//   3. **The silhouette is the icon.** Active and inactive share it EXACTLY: the
//      same shape source draws both, so the selected state adds light and depth
//      and never a different drawing. `shapes` below is that single source, and
//      `nav-glyphs.spec.js` compares the two bounding boxes to hold the line.
//   4. **Dimension comes from planes, not gradients.** A facet is a shape with a
//      tone. No gradient in this file, because a gradient at 20px is mud.
//   5. **32×32 viewBox, content inside 3–29.** One box for the family, so optical
//      size is a property of the drawing rather than of the `size` prop.
//   6. **Cuts are holes, not overlays.** A doorway, a brush mark, a seal's figure
//      — each is subtracted through a mask so the page shows through. A pale
//      shape laid on top would be a fourth tone that has to be re-picked per
//      theme; a hole is correct in both by construction.
//   7. **Nothing below ~1.4 units survives.** At 20px one viewBox unit is 0.63
//      device pixels. A 1-unit rim, a 3-unit inset, a hairline ring: all of them
//      read as a smudge or vanish. Three of the five glyphs lost a detail to this
//      rule in the first round, and the notes below say which.
//
// ── Why not a shared band-shading helper ────────────────────────────────────
// The tempting trick is to paint the silhouette three times, each copy nudged
// down-right, and let the overlaps make three bands. It does produce light on the
// top-left — and it makes the LAST copy dominate the interior, so either the
// shadow tone covers the object or the highlight does. The front face has to be
// the dominant tone, which needs an inward erosion, which a translation cannot
// do. So each glyph names its own facets. It is more authoring and it is the only
// version that reads. (Profile is the exception, and only because concentric
// circles ARE an erosion — see there.)
//
// ── Optical size, and why the drawings are all the same weight ───────────────
// Round two drew each glyph to whatever size looked right on its own, and measured
// as ink it came out Cards 150 · Stories 141 · Practice 134 · Profile 105 · Home
// 102 px² at a common 22px. Multiplied by the bar's own size ramp (NAV_ICON_PX:
// Cards 27.5, Home and Stories 22, Practice 21, More 20) that compounded into a
// 2.3x spread between the heaviest and lightest tab — which does not read as
// hierarchy, it reads as one icon having been designed at a different scale.
//
// So round three balances the DRAWINGS to one weight — 136–145 px² at 22px, a 1.07x
// spread — and leaves the hierarchy entirely to the size the tray asks for. Home
// grew 33% and Profile 37%; Cards came down 3% and Practice went up 8%. That is
// also the only division of labour that survives someone changing the ramp later:
// a glyph that carries its own emphasis is wrong at every other size.
//
// `NAV_GLYPH_PX` in navGlyphFamily.js is the ramp this family wants. It is a
// RECOMMENDATION — navEmphasis.js is untouched and the bar still uses its own
// numbers. These components take a plain `size`; the tray decides, not the glyph.

// ── The palette, as three planes ────────────────────────────────────────────
// Named for the light, not for the colour, so a facet's tone is a statement
// about where it faces.
const LIT = 'var(--primary-bright)'    // faces up / up-left
const FACE = 'var(--primary-fill)'     // faces the viewer
const SHADE = 'var(--primary-pressed)' // faces down / right
// One accent per glyph, at most, and only where it means something.
const PLUM = 'var(--plum)'             // Stories

const BOX = 32

function Svg({ size, children, mask }) {
  return (
    <svg
      width={size} height={size} viewBox={'0 0 ' + BOX + ' ' + BOX}
      fill="none"
      // The navigation's own label is the accessible name (navConfig.js). A glyph
      // that announced itself would read the destination twice.
      aria-hidden="true" focusable="false"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {mask}
      {children}
    </svg>
  )
}

// Every glyph is the same three-part construction, so the family cannot drift:
//
//   shapes   the silhouette, as one or more overlapping solids. Painted in a
//            single flat tone it renders as their union, which is what the
//            inactive state is.
//   facets   the lit / front / shaded planes, clipped to the silhouette.
//   cuts     the holes, subtracted from both states.
//
// `Glyph` takes the three and assembles them, so `active` is the only branch in
// the whole file.
function Glyph({ size, active, color, shapes, facets, cuts }) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '')
  const clipId = 'hdg-c-' + raw
  const maskId = 'hdg-m-' + raw
  const masked = cuts ? { mask: 'url(#' + maskId + ')' } : null
  return (
    <Svg
      size={size}
      mask={(
        <defs>
          <clipPath id={clipId}>{shapes}</clipPath>
          {cuts && (
            <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={BOX} height={BOX}>
              {/* White keeps, black cuts. `currentColor` would follow the theme
                  and silently invert the mask. */}
              <rect width={BOX} height={BOX} fill="#fff" />
              <g fill="#000" stroke="#000">{cuts}</g>
            </mask>
          )}
        </defs>
      )}
    >
      {active
        ? <g clipPath={'url(#' + clipId + ')'} {...masked}>{facets}</g>
        // Inactive: the silhouette, once, in the theme's muted foreground. Same
        // shape, same cuts, no light — a flat stamp of the active glyph.
        : <g fill={color} {...masked}>{shapes}</g>}
    </Svg>
  )
}

// ── Home ────────────────────────────────────────────────────────────────────
// A training-hall gateway, not a house glyph and not a temple.
//
// The two concepts were a stylised roof-and-gate and a plain doorway arch. The
// arch lost: at 20px an arch is a tombstone, and it shares a silhouette with
// every "browse" icon ever drawn. What makes this read as somewhere you arrive
// rather than somewhere you worship is proportion, and it is the one thing the
// audit's "temple?" worry is really about — ONE storey, a roof WIDER than it is
// deep, eaves that lift only slightly, and a doorway big enough to walk through.
// A second eave tier, or a taller roof, and it is a shrine immediately.
//
// Round two sharpened the eaves — the first version's curve read as a soft hump,
// a circus tent rather than a roof — and deleted an under-eave shadow band that
// was drawn at 0.55 opacity. It read as a seam across the wall, and a magic
// opacity is not a tone in a three-tone system anyway.
//
// Round three GREW it, by 40%. Measured, the first family had Home at 102 px² of
// ink against Cards' 150 at the same size — it was not a quieter icon, it was a
// smaller one, and the difference showed as "drawn at a different scale" rather
// than as hierarchy. Home was the family's flattest silhouette (26 × 18.4 in a
// 26 × 26 box), so the growth went into HEIGHT: a deeper roof and a taller wall,
// which is also the change that reads LESS like a shrine, since a shrine is a big
// roof on a low base.
const HOME_ROOF = 'M3.0 14.8C5.4 14.4 7.0 13.1 7.9 11.4L10.7 6.0H21.3L24.1 11.4C25.0 13.1 26.6 14.4 29.0 14.8Z'
const HOME_BODY = { x: 6.8, y: 14.8, width: 18.4, height: 13.6, rx: 1.6 }
// The doorway. Its top is round so the cut reads as an opening rather than a
// notch, and it runs to the floor — a gap in the base is what says "walk in".
const HOME_DOOR = 'M12.1 28.4V20.8a3.9 3.9 0 0 1 7.8 0V28.4Z'

function homeShapes() {
  return (
    <>
      <path d={HOME_ROOF} />
      <rect {...HOME_BODY} />
    </>
  )
}

export function HomeGlyph({ size = 24, active = false, color = 'currentColor' }) {
  return (
    <Glyph
      size={size} active={active} color={color}
      shapes={homeShapes()}
      cuts={<path d={HOME_DOOR} />}
      facets={(
        <>
          {/* The roof is one upward plane, so it is the brightest thing here —
              and the right slope steps down one tone, which is what stops the
              roof reading as a flat chevron. */}
          <path d={HOME_ROOF} fill={LIT} />
          <path d="M16 6.0H21.3L24.1 11.4C25.0 13.1 26.6 14.4 29.0 14.8H16Z" fill={FACE} />
          {/* The body: front wall, its lit left flank, its right return in shade.
              Same L of light as the front flashcard, for the same reason. */}
          <rect {...HOME_BODY} fill={FACE} />
          <rect x="6.8" y="14.8" width="2.2" height="13.6" fill={LIT} />
          <rect x="20.6" y="14.8" width="4.6" height="13.6" fill={SHADE} />
        </>
      )}
    />
  )
}

// ── Cards ───────────────────────────────────────────────────────────────────
// The destination the product is about, so it gets the most ink on the bar: two
// cards, the second smaller and sitting up and to the right of the first.
//
// **Five drawings, and the four that lost are worth recording, because the shape
// space here turns out to be unusually crowded.**
//
//   1. **A pair with a mark on the front card**, twice. A round-capped diagonal
//      stroke inside a rounded rect is the compose/edit PENCIL, exactly. Tapering
//      it into a 撇 brush stroke — meant to say "ink" — turned it into a fountain
//      pen NIB. A tab that looks like an edit button is worse than a tab with
//      nothing drawn on it, and the brief's "one card with a brush/Hanzi mark" has
//      nowhere to land at 20px: every mark that fits is already spoken for.
//   2. **A fan — the back card rotated 14°.** A rotated rect behind an upright one
//      never resolves into a clean wedge. Too little offset and the visible sliver
//      is a curled corner; too much and it is a flag stuck to the side. Both were
//      drawn. Both looked like damage rather than depth.
//   3. **A face-on deck — one card with the top edge of the next above it.** This
//      one is instructive: a full-width band above a big rounded rect is a LID.
//      Both the narrow version and the near-full-width version read as a jar or a
//      tin, and no amount of adjusting the peek fixed it, because the problem is
//      the vertical stack itself.
//
// So the answer is the axis-aligned diagonal pair, which is also what the shipped
// flat icon does (NavIcons.jsx) and has therefore already passed device QA once.
// The standing objection to it — that two offset rounded rects are the
// copy/duplicate glyph — is answered by making the second card SMALLER: copy is
// always two rectangles of the same size, square to each other. A smaller card up
// and to the right reads as one seen a little further off, which is a deck. And
// the tab has a label under it, and a container around it, and neither of those is
// available to a copy button.
//
// **The separation cut is the other thing to get right.** A gap between the cards
// cannot be geometry: the inactive state paints the shapes in ONE tone, so without
// a hole the pair is a single blob. Round one cut a rounded rect placed by eye,
// whose left edge ran straight down the middle of the FRONT card and carved a
// stripe out of it — the pair read as a letter. The cut is derived now: the front
// card's own rect, grown 1.2 units on every side and stroked 2.4, so the ring of
// removed pixels lies exactly OUTSIDE the front card and eats only into the card
// behind it. Both cards keep whole edges, and the gap is 2.4 wide in both states
// whatever anyone later does to the geometry.
//
// Coral was on the brief for this glyph and is deliberately NOT used. The only
// place a second tone could go is the card behind, and that card is the one
// surface in the drawing that is IN SHADOW — putting the lighter of two reds
// there contradicts the family's single light source, which is the rule the whole
// family hangs on. Cards earns its prominence from size and mass instead: 150 px²
// of ink at 22px against Home's 102, and the bar draws it at 27.5 rather than 22,
// which puts it at 234 against Stories' 141 — the widest margin the tab has ever
// had (P8's fixed bar had Practice at 81% of Cards).
const CARDS_FRONT = { x: 5.5, y: 10.7, width: 15, height: 16.2, rx: 2.8 }
const CARDS_GAP = 1.2
// Smaller than the front card, and that is what separates a DECK from the
// copy/duplicate icon: copy is always two rectangles of equal size, square to
// each other. A smaller card sitting up and to the right reads as one seen a
// little further away — the same trick the shipped flat icon uses (NavIcons.jsx),
// which device QA has already passed once.
const CARDS_BACK = { x: 13.8, y: 5.6, width: 12.8, height: 14, rx: 2.4 }

function cardsShapes() {
  return (
    <>
      <rect {...CARDS_BACK} />
      <rect {...CARDS_FRONT} />
    </>
  )
}

export function CardsGlyph({ size = 24, active = false, color = 'currentColor' }) {
  return (
    <Glyph
      size={size} active={active} color={color}
      shapes={cardsShapes()}
      cuts={(
        <rect
          x={CARDS_FRONT.x - CARDS_GAP} y={CARDS_FRONT.y - CARDS_GAP}
          width={CARDS_FRONT.width + CARDS_GAP * 2} height={CARDS_FRONT.height + CARDS_GAP * 2}
          rx={CARDS_FRONT.rx + CARDS_GAP}
          fill="none" stroke="#000" strokeWidth={CARDS_GAP * 2}
        />
      )}
      facets={(
        <>
          <rect {...CARDS_BACK} fill={SHADE} />
          <rect {...CARDS_FRONT} fill={FACE} />
          {/* The front card's lit top edge and left flank — an L, so the light
              has a direction rather than just a top — and its right return in
              shade, which is what gives the card a thickness. */}
          <rect x={CARDS_FRONT.x} y={CARDS_FRONT.y} width={CARDS_FRONT.width} height="2.6" rx="1.3" fill={LIT} />
          <rect x={CARDS_FRONT.x} y={CARDS_FRONT.y} width="2.4" height={CARDS_FRONT.height} rx="1.2" fill={LIT} />
          <rect x="17.1" y={CARDS_FRONT.y} width="3.4" height={CARDS_FRONT.height} fill={SHADE} />
        </>
      )}
    />
  )
}

// ── Stories ─────────────────────────────────────────────────────────────────
// An open book, and its whole job is to be unmistakable next to Cards. It is
// wide where Cards is tall, symmetric where Cards is diagonal, and notched at the
// top centre where Cards is a clean corner. Silhouette does that work — not
// detail, which is the first thing to disappear at 20px.
//
// Round two shrank it. Measured as ink coverage — rasterise the silhouette, sum
// the alpha, the same measurement that set NAV_ICON_PX in P8 — the first draft
// came out at 165 px² against Home's 108, which made the calmest destination on
// the bar the second loudest object on it. A filled open book is simply a lot of
// paper. Narrower, shallower, and a wider spine gap brings it to about 135, and
// the drawing is not visibly different at 22px.
const BOOK_L = 'M16 11.9C13.2 9.5 9.3 8.6 5.2 9.1A1.3 1.3 0 0 0 4.1 10.4V22.2A1.3 1.3 0 0 0 5.4 23.5C9.4 23.1 13.2 24 16 26.1Z'
const BOOK_R = 'M16 11.9C18.8 9.5 22.7 8.6 26.8 9.1A1.3 1.3 0 0 1 27.9 10.4V22.2A1.3 1.3 0 0 1 26.6 23.5C22.6 23.1 18.8 24 16 26.1Z'

function storiesShapes() {
  return (
    <>
      <path d={BOOK_L} />
      <path d={BOOK_R} />
    </>
  )
}

export function StoriesGlyph({ size = 24, active = false, color = 'currentColor' }) {
  return (
    <Glyph
      size={size} active={active} color={color}
      shapes={storiesShapes()}
      cuts={(
        // The spine: a gap, so the two pages read as two pages in both states.
        // Without it the filled book is a slab. 2 units, not the 1.6 of round
        // one — at 20px 1.6 units is one device pixel, which is a seam rather
        // than a spine.
        <rect x="15" y="10.6" width="2" height="16.6" />
      )}
      facets={(
        <>
          {/* Left page tilts toward the light, right page away from it. That is
              the entire dimensional story and it survives 20px. */}
          <path d={BOOK_L} fill={LIT} />
          <path d={BOOK_R} fill={FACE} />
          {/* The block of pages, seen along the bottom edge. */}
          <path d="M4.1 21.5H27.9V22.2A1.3 1.3 0 0 1 26.6 23.5C22.6 23.1 18.8 24 16 26.1 13.2 24 9.4 23.1 5.4 23.5A1.3 1.3 0 0 1 4.1 22.2Z" fill={SHADE} />
          {/* A ribbon marking someone's place — the one accent in the family, and
              the only part of any of these drawings that is about a person rather
              than an object. 3.6 wide rather than 2.8: at 20px the narrower one is
              1.7 device pixels of violet and reads as a rendering artefact. */}
          <path d="M21.4 9.4H25V16.8L23.2 15 21.4 16.8Z" fill={PLUM} />
        </>
      )}
    />
  )
}

// ── Practice ────────────────────────────────────────────────────────────────
// Four drill tiles. The alternative concept was a stack of slabs for
// "repetition", and it lost for one concrete reason: a stack of offset
// rectangles is what Cards already is, and two stacked-rectangle glyphs 60px
// apart on the same bar is the confusion the family cannot afford.
//
// Four tiles keeps P8's metaphor — Practice is a shelf of drills, not a bullseye
// about aiming — and the grid gives dimension for free: each tile catches the
// light differently, so the light source is legible without a single facet being
// drawn. Nothing else in the family is a square, and a square divided in four is
// also the shape of the 田字格 practice grid, which is a happy accident rather
// than a symbol anyone has to recognise.
//
// **The blue accent was drawn and then removed.** Practice's atmosphere colour is
// `--blue`, and the obvious home for it was a small inset inside the lit tile —
// "the drill you are on". At 20px that inset is 2.7 device pixels of blue inside
// a red square, which does not read as a mark on a surface; it reads as an
// unread-notification badge, i.e. as something demanding a tap. The other option,
// filling one whole tile blue, puts a quarter of the glyph in a second hue and
// makes Practice look like a different app's icon on the same bar — the exact
// fragmentation the brief warns about. So Practice is vermilion only, and its
// accent is deferred to whatever P14-4 does with the tray itself.
const TILE = 8.9
const TILE_GAP = 1.5
const TILE_A = 16 - TILE_GAP / 2 - TILE
const TILE_B = 16 + TILE_GAP / 2
// 2 rather than 2.4: the rounder corners read as app tiles on a home screen. A
// tighter radius reads as paper, which is what this is meant to be.
const TILE_R = 2
const TILES = [
  { x: TILE_A, y: TILE_A, tone: LIT },    // nearest the light
  { x: TILE_B, y: TILE_A, tone: FACE },
  { x: TILE_A, y: TILE_B, tone: FACE },
  { x: TILE_B, y: TILE_B, tone: SHADE },  // furthest from it
]

function practiceShapes() {
  return TILES.map(t => (
    <rect key={t.x + '-' + t.y} x={t.x} y={t.y} width={TILE} height={TILE} rx={TILE_R} />
  ))
}

export function PracticeGlyph({ size = 24, active = false, color = 'currentColor' }) {
  return (
    <Glyph
      size={size} active={active} color={color}
      shapes={practiceShapes()}
      facets={TILES.map(t => (
        <rect key={t.x + '-' + t.y} x={t.x} y={t.y} width={TILE} height={TILE} rx={TILE_R} fill={t.tone} />
      ))}
    />
  )
}

// ── Profile ─────────────────────────────────────────────────────────────────
// A seal — a chop — with a figure cut into its face.
//
// Three concepts, and the two that lost are worth recording because both are
// more "Chinese" than the one that shipped:
//
//   · **The seal as an OBJECT** — the squat block with a knob on top that you
//     actually hold. Handsome at 32px, a rectangle with a bump at 20px, and
//     illegible to anyone who has not held one.
//   · **The seal as a SQUARE stamp**, which is what a real 印章 impression
//     usually is. Rejected on weight, measured not guessed: a filled rounded
//     square with the figure knocked out inks about 140 px² at 22px against this
//     disc's 105, which would make Profile — the quietest destination on the
//     bar — heavier than Practice. A navigation icon's ink budget is part of its
//     meaning.
//
// So this is the seal's FACE, which is a disc — and a disc in a navigation bar
// already means "you" to everyone, which is exactly the legibility the brief
// asked for. Round because Practice is already the family's square, and a circle
// is the one silhouette nothing else here can be confused with.
//
// What keeps it from being a stock avatar is the inked rim: light along the upper
// left, a thicker band of shade along the lower right, so the disc reads as a
// stamp with a raised edge rather than a flat circle. Round one had exactly this
// idea with radii 0.8 units apart, which at 20px is half a device pixel — the
// facets were in the DOM and invisible on screen. They are 1.8 apart now.
//
// Round three scaled the whole glyph up by 1.15 about its centre — r 11 → 12.6 —
// for the family-balance reason rather than a drawing one: at 105 px² of ink it
// was 30% lighter than everything except Home, which reads as a smaller icon
// rather than a quieter one. Every number below is the round-two drawing times
// 1.1455, so the proportions are untouched.
const SEAL = { cx: 16, cy: 16, r: 12.6 }

export function ProfileGlyph({ size = 24, active = false, color = 'currentColor' }) {
  return (
    <Glyph
      size={size} active={active} color={color}
      shapes={<circle cx={SEAL.cx} cy={SEAL.cy} r={SEAL.r} />}
      cuts={(
        // Head and shoulders, drawn as one solid stamp rather than an outline —
        // a chop is ink, and an outlined figure inside a disc reads as a button.
        <>
          <circle cx="16" cy="12.1" r="4" />
          {/* The shoulders' bottom edge is an ARC CONCENTRIC with the disc, not a
              flat line. Round two ended them flat and 2.4 units short of the rim,
              which leaves a crescent — thick under the chin, nothing at the sides
              — and a crescent inside a circle is a mouth. Round three ran them
              past the rim instead, and the disc lost its whole bottom and became a
              map pin. A concentric arc leaves an even 2.5-unit ring all the way
              round, which is what reads as a stamp with a figure inked into it. */}
          <path d="M8.04 22.19C8.04 18.63 11.42 16.34 16 16.34S23.96 18.63 23.96 22.19A10.08 10.08 0 0 1 8.04 22.19Z" />
        </>
      )}
      facets={(
        <>
          {/* Concentric and offset — the one place in the family where nudged
              copies give clean facets, because shrinking a circle IS eroding it.
              Rim in shade, the same rim lifted up-left, then the face. */}
          <circle cx={SEAL.cx} cy={SEAL.cy} r={SEAL.r} fill={SHADE} />
          <circle cx="14.85" cy="14.85" r={SEAL.r} fill={LIT} />
          <circle cx="16.46" cy="16.46" r="10.54" fill={FACE} />
        </>
      )}
    />
  )
}

// ── More ────────────────────────────────────────────────────────────────────
// Three raised slabs. The More tab opens a sheet of extra destinations, so the
// glyph is a menu object — and it is a menu of THINGS, with tops the light catches
// and undersides it does not, rather than three lines ruled on paper.
//
// Three candidates were drawn and measured side by side, because "unmistakably
// More" and "belongs to this family" pull in opposite directions here:
//
//   · **Three raised lacquer dots**, the canonical overflow mark, and the one the
//     brief names first. It loses on mass, measured not argued: three discs that
//     fit inside 26 units with visible gaps are r 3.6, which inks **56 px² at
//     22px against the family's ~140** — two and a half times lighter than
//     anything else, a thin horizontal line of marks next to five solid objects.
//     And a 3.6-unit disc cannot carry a rim: its facets come out ~0.7 units, half
//     a device pixel at 22px, so the dots render FLAT while the rest of the family
//     is dimensional. Both failures are structural, not tuning — dots are small.
//   · **Three dots cut out of a raised plaque**, which fixes the mass (128 px²)
//     and is dimensional in exactly the family's vocabulary. Rejected on
//     recognition: a wide rounded lozenge with three dots inside it is the
//     universal CHAT / typing-indicator glyph, and it read as a message bubble
//     immediately, at every size. Recognisable as the wrong thing is worse than
//     unfamiliar.
//   · **Three raised slabs** — 140 px², a 19 × 21 silhouette that matches the
//     family, and bars deep enough (5.4 units) to hold a lit top edge and a
//     shaded underside at 20px. This one.
//
// It is close to a hamburger, and that is the point rather than a compromise: the
// tab is labelled More and it opens a list. Recognition beat invention here, which
// is what the brief asked for. Nothing person-shaped goes anywhere near it —
// Profile is a different icon for a different place.
const MORE_BAR = { x: 6.5, width: 19, height: 5.4, rx: 2.2 }
const MORE_Y = [5.9, 13.7, 21.5]
// The lit top and the shaded underside. 1.7 and 1.4 rather than something tidier
// like 1.5 each: the top edge of a raised object catches more light than its
// underside loses, and at 20px 1.7 units is 1.06 device pixels — the floor.
const MORE_LIT = 1.7
const MORE_SHADE = 1.4

function moreShapes() {
  return MORE_Y.map(y => <rect key={y} {...MORE_BAR} y={y} />)
}

export function MoreGlyph({ size = 24, active = false, color = 'currentColor' }) {
  return (
    <Glyph
      size={size} active={active} color={color}
      shapes={moreShapes()}
      facets={(
        <>
          {MORE_Y.map(y => <rect key={y} {...MORE_BAR} y={y} fill={FACE} />)}
          {MORE_Y.map(y => (
            <rect
              key={'l' + y} x={MORE_BAR.x} y={y} width={MORE_BAR.width}
              height={MORE_LIT} rx={MORE_LIT / 2} fill={LIT}
            />
          ))}
          {MORE_Y.map(y => (
            <rect
              key={'s' + y} x={MORE_BAR.x} y={y + MORE_BAR.height - MORE_SHADE}
              width={MORE_BAR.width} height={MORE_SHADE} rx={MORE_SHADE / 2} fill={SHADE}
            />
          ))}
        </>
      )}
    />
  )
}

// The ordered family lives in navGlyphFamily.js — this file exports components
// only (react-refresh), the same split navConfig.js makes against NavIcons.jsx.
