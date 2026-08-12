// Geometry for the app's bottom sheets (dictionary entry, word lookup).
//
// Three things kept going wrong on phones, so they live here as one shared
// answer instead of being re-typed inline in each sheet:
//
// 1. **The sheet must own its own stacking context at <body> level.** The app
//    shell's <main> sets `position: relative; z-index: 1`, which makes a
//    stacking context — a `z-index: 200` overlay rendered *inside* it is still
//    painted below the sibling MobileNav (`z-index: 30`). The bottom ~62px of
//    the sheet then sits under the nav bar and can never be scrolled clear of
//    it. The sheets therefore render through a portal to <body>; these styles
//    assume that.
// 2. **The scroll area is the body, not the shell.** The header (grab handle,
//    Back, Close) stays pinned while the entry scrolls, so the way out of the
//    sheet is always reachable and the visible area is spent on content.
// 3. **`flex: 1` scroll areas need `min-height: 0`** inside a fixed-height flex
//    column (CLAUDE.md §5), or they grow to fit their content and the overflow
//    is clipped instead of scrolled.
//
// Bottom padding reserves `env(safe-area-inset-bottom)` so the last row clears
// the home indicator. It resolves to 0 on hardware without one.

export const SHEET_MAX_WIDTH = 560       // px — matches the reader sheets
export const SHEET_MAX_HEIGHT = '92%'    // of the overlay, which is 100dvh
export const SHEET_SIDE_PADDING = 18     // px
export const SHEET_BOTTOM_PADDING = 26   // px, before the safe-area inset

// `calc(...)` rather than a plain number: env() can only be read by the browser.
export function sheetSafeBottom(basePx) {
  const base = Number(basePx) >= 0 ? Number(basePx) : SHEET_BOTTOM_PADDING
  return 'calc(' + base + 'px + env(safe-area-inset-bottom))'
}

// The full-screen dimmed backdrop. Pair with className="app-overlay-viewport",
// which supplies `height: 100dvh` — the VISIBLE viewport, so the sheet's bottom
// is never left behind the browser's own chrome.
export function sheetOverlayStyle() {
  return {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    background: 'rgba(0,0,0,0.14)',
  }
}

// The sheet itself: a fixed-height flex column. It does NOT scroll — its body
// does. `overflow: hidden` keeps the scrolled content inside the rounded top.
export function sheetShellStyle() {
  return {
    width: '100%', maxWidth: SHEET_MAX_WIDTH + 'px', maxHeight: SHEET_MAX_HEIGHT,
    display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden',
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: '18px 18px 0 0', boxShadow: 'var(--shadow-sheet)',
  }
}

// Pinned header row — never scrolls away, so Close is always one tap.
export function sheetHeaderStyle() {
  return {
    flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: '12px', padding: '2px ' + SHEET_SIDE_PADDING + 'px 8px',
  }
}

// The grab handle above the header.
export function sheetHandleStyle() {
  return {
    width: '38px', height: '4px', borderRadius: '999px', flexShrink: 0,
    background: 'var(--border)', margin: '10px auto 8px',
  }
}

// The scrolling body. `overscrollBehavior: contain` stops a swipe past the end
// from scrolling the page underneath the sheet.
export function sheetBodyStyle(bottomPx) {
  return {
    flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain',
    WebkitOverflowScrolling: 'touch',
    padding: '0 ' + SHEET_SIDE_PADDING + 'px ' + sheetSafeBottom(bottomPx),
  }
}
