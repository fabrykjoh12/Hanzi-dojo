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
import { MOBILE_NAV_HEIGHT } from './navMetrics'

// The bar's own top border. Part of the 58px, so it comes out of the column's
// budget.
const BORDER = 1

// Per-tab glyph size in px.
//
// · study (Cards) — one step up again, 25 → 27.5. Paired with the container it
//   is the largest thing on the bar by a distance that reads as intent.
// · home / stories — unchanged at 22. These are the reference weight.
// · practice — 22 → 21, and the glyph itself is drawn quieter (NavIcons.jsx:
//   smaller tiles, a wider gap, a lighter stroke). Size alone could not fix it;
//   at 22px the 2×2 out-inked everything.
// · more — 22 → 20. Utility navigation, and the only tab whose job is to be
//   easy to ignore.
export const NAV_ICON_PX = {
  practice: 21,
  home: 22,
  study: 27.5,
  stories: 22,
  more: 20,
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
  paddingTop: 3.5,
  iconRow: CARDS_SHELL.height,
  gap: 2,
  labelLine: 13,
  paddingBottom: 3.5,
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

// How much of the resting container actually lands.
//
// It was a flat `var(--surface-2)` for one build, and on a device that read as
// a SECOND selected tab: a filled box behind a tab is what Android uses to mean
// "you are here", and Cards was wearing one on every screen. Measured as the
// composite delta against the bar's own ground — the only number that matters,
// since the bar is translucent — `--surface-2` sat about 13/255 above it in
// dark and about 10 below it in light.
//
// 55% of that. Mixing a colour with `transparent` is a mix of its ALPHA, so the
// container composites at 0.55 of the step it used to make, in both themes,
// without a second hardcoded colour to keep in step. ~6/255 is present when you
// look for it and gone when you are not looking — which is the whole brief.
//
// The resting hierarchy is meant to be carried by the centre column, the larger
// glyph and the heavier label FIRST, and by this only last.
const REST_SHELL_STRENGTH = '55%'

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
    transition: 'background 160ms ease, border-color 160ms ease',
  }
}
