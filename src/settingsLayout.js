// How a Settings card composes itself at a given width.
//
// The defect this exists to fix (P10-A1): every Settings row's content column
// had its right edge at x=375 on a 320px viewport. Titles and descriptions were
// cut mid-word — "Choose a light or dark theme for the", "Flip lets you reveal
// the answer and grade your". `overflowX` was 0, so nothing scrolled and no test
// caught it; an ancestor was simply hiding 55px of every row.
//
// The cause was a desktop row that had never been asked to be narrow. The card
// is a flex row — a fixed 44px icon, a 16px gap, 24px of padding each side — and
// its text column contains a segmented control declared `inline-flex` with 16px
// of padding per option and no wrap. An inline-flex row cannot shrink below its
// content, so the control's min-content width became the column's floor:
//
//   at 320:  320 − 32 (page) − 48 (card padding) − 60 (icon + gap) = 180px available
//   the 3-option audio-speed control's min-content:               ≈ 274px
//
// Hiding the overflow would have hidden the defect. The fix is to let the card
// compose VERTICALLY when the row cannot fit — title, description, then the
// control at full width — which is what a phone wants anyway.
//
// Pure, so the rule can be asserted without a browser. The geometry it describes
// is verified against real renders in tests/e2e/settings-responsive.spec.js.

// Below this viewport width a Settings card stacks. 480 rather than the shell's
// 768 breakpoint: the shell flag answers "bottom bar or sidebar" and is forced
// true on every native tablet, where a 1024px-wide card row fits perfectly well.
// This is a question about one component's width, so it is measured in width.
export const CARD_STACK_MAX_WIDTH = 480

// Page gutter and card padding, so the arithmetic above stays in one place.
const PAGE_GUTTER = 16
const CARD_PAD_X_STACKED = 18
const CARD_PAD_X_ROW = 24
const ICON_COL = 44
const ICON_GAP = 16

export function settingsCardStacks(width) {
  const w = Number(width)
  // An unknown width stacks. `NaN < 480` is false, which would have picked the
  // ROW layout — the broken one — on a first render before a width is known.
  // When in doubt, compose the way that cannot clip.
  if (!Number.isFinite(w)) return true
  return w < CARD_STACK_MAX_WIDTH
}

// The card's own layout. Stacked: the icon and title share the top line, the
// description and the control get the card's full inner width underneath.
export function settingsCardLayout(width) {
  const stacked = settingsCardStacks(width)
  return {
    stacked,
    padding: stacked
      ? '18px ' + CARD_PAD_X_STACKED + 'px'
      : '22px ' + CARD_PAD_X_ROW + 'px',
    gap: stacked ? 13 : ICON_GAP,
    iconBox: stacked ? 38 : ICON_COL,
    iconGlyph: stacked ? 19 : 21,
  }
}

// How much room a control actually has, once the page gutters, the card padding
// and (in row layout) the icon column are taken out. This is the number the old
// layout got wrong by 94px.
export function controlWidthAt(width) {
  const w = Number(width)
  if (!Number.isFinite(w)) return 0
  const stacked = settingsCardStacks(w)
  const padX = (stacked ? CARD_PAD_X_STACKED : CARD_PAD_X_ROW) * 2
  const icon = stacked ? 0 : ICON_COL + ICON_GAP
  return Math.max(0, w - PAGE_GUTTER * 2 - padX - icon)
}

// A segmented control's layout.
//
// Full width on a phone, as an equal-column grid rather than an inline row: a
// grid can be told to divide the space it has, which is the property the old
// inline-flex lacked. Two choices become two half-width columns, which is the
// treatment a phone segmented control should have had all along.
//
// `showIcons` is the one thing that gives way under pressure, and only when the
// arithmetic says a label would otherwise be squeezed. The labels themselves are
// never shrunk — a 13px option label is already the floor.
export function segmentedLayout({ width, count, longestLabel = 6 }) {
  const fullWidth = settingsCardStacks(width)
  const available = controlWidthAt(width);
  // 4px of container padding each side, 8px between options.
  const perColumn = count > 0
    ? (available - 8 - (count - 1) * 8) / count
    : available
  // A label at 13px averages ~7.2px per character, plus 10px of padding a side.
  const labelSpace = longestLabel * 7.2 + 20
  const iconSpace = 16 + 7
  const showIcons = !fullWidth || perColumn >= labelSpace + iconSpace

  return {
    fullWidth,
    columns: count,
    // Never below the 44px a thumb needs, in either layout.
    minHeight: 44,
    optionPadding: fullWidth ? '0 8px' : '0 16px',
    showIcons,
    perColumn: Math.round(perColumn * 10) / 10,
    fits: perColumn >= labelSpace,
  }
}
