// The bottom bar's visual hierarchy, as numbers.
//
// P8 asked one question — does the eye understand that Cards is the core
// action? — and the answer on a device was "not yet". This module is where the
// answer lives, because all three of the things that decide it are arithmetic:
//
//   1. **Optical size, not CSS size.** Two glyphs at the same `size` are not
//      the same weight. Measured as ink coverage (rasterise the glyph, sum the
//      alpha), the bar that shipped in `c7eb6c6` read:
//
//        Practice 158 · Cards 147 · Stories 111 · Home 106 · More 19  px²
//
//      Practice — four tiles in a 2×2 — was the heaviest object on the bar,
//      ahead of the tab the whole product is about. That is the defect a
//      screenshot showed and a CSS diff could not: Cards WAS three pixels
//      bigger and still lost. The sizes below are chosen against the measured
//      numbers, not against each other's `size` prop.
//
//   2. **The container.** Cards gets a rounded box behind its glyph — the only
//      tab that does. It is what makes the emphasis survive being glanced at,
//      and it is icon-only: the label stays outside it, on the same line as
//      every other label.
//
//   3. **The column budget.** The container is 34px tall inside a 58px bar, so
//      the column has to add up or the bar grows — and the bar is not allowed
//      to grow, because `studyLayout` spends every pixel of what is left on the
//      flashcard. `navColumnHeight()` is that sum, and its test is what stops
//      this file from ever quietly costing the flashcard a line of prompt.
//
// Numbers only. No JSX, no React — the bar reads these, and a test reads them
// too (CLAUDE.md §3).
import {
  MOBILE_NAV_HEIGHT, NAV_TRAY_INSET, NAV_TRAY_BOTTOM, NAV_TRAY_RADIUS_NAME,
} from './navMetrics'
import { RADIUS, ELEVATION } from './shape'

// The tray's border, top AND bottom. It was one edge when the bar was a flush
// slab; a floating object has a border all the way round, so the column's budget
// loses two pixels rather than one.
const BORDER = 2

// Per-tab glyph size in px — and since P14-4 this table IS the bar's visual
// hierarchy, because the glyphs are no longer drawn to different weights.
//
// The flat family (NavIcons.jsx) needed a steep ramp: measured as ink, its
// Practice grid out-drew its Cards glyph, so Cards had to be pushed to 27.5
// against 20–22 to win, a 1.89× area ratio. The dimensional family (navGlyphs.jsx)
// is drawn to ONE weight — 136–145 px² of ink at 22px across all six glyphs — so
// the ramp no longer has to correct for the drawings and can be what a row of five
// objects actually wants.
//
// Measured at these sizes the bar reads Cards 203 · Stories 168 · Practice 165 ·
// Home 149 · More 140 px². Cards is clearly first; Stories and Practice sit at
// 81–83% of it, which is where P8 left Practice relative to Cards on the bar that
// passed device QA; Home and More are quieter. 1.45× top to bottom, where the old
// ramp applied to the new drawings would have been 1.96×.
//
// Emphasis is not carried by size alone and never was: CARDS_SHELL, the centre
// column and the label's weight are all still doing their share, which is what
// lets the size step be this modest.
export const NAV_ICON_PX = {
  study: 26,
  stories: 24,
  practice: 23.5,
  home: 23,
  more: 22,
}

// The Cards container. Icon-only, inside the bar, no float and no notch.
//
// 42×34 sits mid-range of what the brief allowed (40–44 × 34–38) because the
// top of that range starts to crowd the label on a 320px phone, and the label
// is not negotiable — no icon-only tabs.
export const CARDS_SHELL = { width: 42, height: 34, radius: 12 }

// The column, top to bottom. Every icon — container or not — is centred in a
// row of `iconRow`, so the five glyphs share one centre line whatever their
// size, and a bigger Cards glyph grows about that line instead of pushing its
// label down.
//
// `labelLine` is declared rather than inherited: the label's line box used to
// be whatever `normal` line-height made of 10.5px (15.75px), which is 2.75px
// the container needs more than the label does.
export const NAV_COLUMN = {
  paddingTop: 4,
  iconRow: CARDS_SHELL.height,
  gap: 2,
  labelLine: 13,
  paddingBottom: 4,
}

export function navIconPx(key) {
  return NAV_ICON_PX[key] || NAV_ICON_PX.home
}

// What the column actually costs. Must stay inside MOBILE_NAV_HEIGHT − border,
// or the bar grows and the flashcard pays for it.
export function navColumnHeight() {
  const c = NAV_COLUMN
  return c.paddingTop + c.iconRow + c.gap + c.labelLine + c.paddingBottom
}

export function navColumnFits() {
  return navColumnHeight() <= MOBILE_NAV_HEIGHT - BORDER
}

// The row a glyph sits in when it has no container: the same height as the
// container, so the centre line is shared.
export function iconRowStyle() {
  return {
    height: NAV_COLUMN.iconRow + 'px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }
}

// ── The tray ────────────────────────────────────────────────────────────────
// P14-4's whole visible change, as a style object, so a unit test can assert the
// inset, the radius, the height and the surface without a browser — and so the
// gallery and the bar cannot draw two different trays.
//
// Solid, not glass. The bar was `--surface-glass` + `blur(14px)` for its whole
// life, which is a 2018 idea and reads as a translucent film rather than an
// object; a detached tray has to be a THING, and a thing has one colour. It also
// costs a compositing layer on every scroll of every screen, which the blur was
// buying nothing for now that the tray does not span the viewport.
//
// `--surface` and not `--surface-2`: the tray is the app's most card-like object
// and every card in the app is `--surface`, so it inherits the step the palette
// already tuned against `--bg` in both themes — #FFFFFF on #FAF8F5 in light,
// #1A1517 on #100D0E in dark. In dark that is a lift of about 10/255, which is the
// brief's "slightly lifted, not dramatically lighter"; the separation that makes it
// read as detached comes from the border and the shadow, not from brightness.
//
// `ELEVATION.floating` and not `sheet`: a floating object casts DOWN, and there is
// somewhere for it to cast now — the page ground between the tray and the screen
// edge. `sheet` points upward and belongs to panels hinged on the bottom edge,
// which this no longer is.
//
// Plus a lit top edge, and that hairline is the whole of the dark-mode answer.
// Measured: in dark, `--surface` sits about 10/255 above `--bg` and `--shadow-2`
// is a black cast on a near-black page, so it contributes almost nothing — which
// left the border doing all of the separating and the tray reading as an OUTLINE
// rather than an object. `--inset-highlight` is rgba(255,255,255,0.045) in dark, so
// one row of pixels along the top edge lifts about 10/255: the top of the object
// catches the light, which is what says "this is in front". In light it is 0.75
// white over #FFFFFF and therefore does nothing at all, which is correct — light
// mode never had the problem.
export function navTrayStyle() {
  return {
    position: 'fixed',
    left: NAV_TRAY_INSET + 'px',
    right: NAV_TRAY_INSET + 'px',
    bottom: NAV_TRAY_BOTTOM,
    zIndex: 30,
    display: 'flex',
    alignItems: 'stretch',
    boxSizing: 'border-box',
    height: MOBILE_NAV_HEIGHT + 'px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: RADIUS[NAV_TRAY_RADIUS_NAME] + 'px',
    boxShadow: ELEVATION.floating + ', inset 0 1px 0 var(--inset-highlight)',
    // The corners are the point of the object, so nothing inside may square them:
    // a tab's press feedback paints a background, and the first and last columns
    // reach into the curve.
    overflow: 'hidden',
  }
}

// How much of the resting container actually lands.
//
// It was a flat `var(--surface-2)` for one build, and on a device that read as
// a SECOND selected tab: a filled box behind a tab is what Android uses to mean
// "you are here", and Cards was wearing one on every screen. Measured as the
// composite delta against the bar's own ground — the only number that matters,
// since the bar is translucent — `--surface-2` sat about 13/255 above it in
// dark and about 10 below it in light.
//
// Mixing a colour with `transparent` is a mix of its ALPHA, so the container
// composites at a fraction of the step it used to make, in both themes, without a
// second hardcoded colour to keep in step. ~6/255 is present when you look for it
// and gone when you are not looking — which is the whole brief.
//
// **P14-4 recalibrated the number without changing what lands.** It was 55%, and
// 55% was measured against the OLD bar, whose ground was `--surface-glass`
// (rgba(255,248,245,0.85)) — 55% of the step from that to `--surface-2` composites
// to 5.5/255. The tray is opaque `--surface` now, i.e. pure #FFFFFF in light, and
// the same declaration lands at 10.5/255: nearly double, and 80% of the way to the
// ~13 that read as "a second selected tab" on a device. So the percentage came
// down to hold the RENDERED value where device QA left it — 30% of the step from
// #FFFFFF to #F5F1EC is 5.7/255. Same appearance, different arithmetic behind it,
// because the ground moved.
//
// The resting hierarchy is meant to be carried by the centre column, the larger
// glyph and the heavier label FIRST, and by this only last.
const REST_SHELL_STRENGTH = '30%'

// The container, in both states.
//
// Inactive: a barely-perceptible neutral step (above).
//
// Active: the accent MIXED INTO a surface, never an alpha hex over it
// (CLAUDE.md §5 — an `accent + '14'` stays light in dark mode). 12% is a tint,
// not a block: a saturated red rectangle at the bottom of every screen is the
// thing this was explicitly not allowed to become, and the accent still reads
// unmistakably because the glyph inside it is the accent at full ink.
//
// The two states have to stay obviously different, and they differ three ways
// on purpose: hue (neutral vs accent), strength (0.55 alpha vs a full 12% tint)
// and edge (no border vs a 26% accent hairline) — on top of the glyph filling
// and the label going bold, which are the signals that do not depend on the
// container existing at all.
export function cardsShellStyle({ active, accentHex }) {
  return {
    boxSizing: 'border-box',
    width: CARDS_SHELL.width + 'px',
    height: CARDS_SHELL.height + 'px',
    borderRadius: CARDS_SHELL.radius + 'px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    background: active
      ? 'color-mix(in srgb, ' + accentHex + ' 12%, var(--surface))'
      : 'color-mix(in srgb, var(--surface-2) ' + REST_SHELL_STRENGTH + ', transparent)',
    // Transparent when inactive rather than absent, so the box is the same size
    // in both states and the glyph cannot shift by a pixel on selection.
    border: active
      ? '1px solid color-mix(in srgb, ' + accentHex + ' 26%, var(--surface))'
      : '1px solid transparent',
    // P14-4's one addition, and it is a hairline: a lit top edge on the selected
    // container, so the container agrees with the glyph inside it about where the
    // light comes from. Not a shadow — an inset highlight, the same idiom the
    // bottom sheets use. On the resting container there is nothing to light.
    boxShadow: active ? 'inset 0 1px 0 var(--inset-highlight)' : 'none',
    transition: 'background 180ms ease, border-color 180ms ease, box-shadow 180ms ease',
  }
}
