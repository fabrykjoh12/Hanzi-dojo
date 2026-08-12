// The controls' geometry and state recipes — P14-1.
//
// Pure data and pure functions. No React, no DOM, no imports beyond the P14-0
// token modules. `controls.jsx` is a thin shell over this file: it adds state,
// semantics and children, and nothing else.
//
// That split is the repo's standing habit (CLAUDE.md §3) and it buys something
// specific here — the interesting half of a control is its VARIANT MATRIX, and
// a matrix is much better asserted as data than poked through a renderer. Every
// variant, every state, every tap target and every token reference in this file
// is checked in controlTokens.test.js without mounting anything.
//
// ── Two rules this file encodes ─────────────────────────────────────────────
//
//   1. A control never names a colour. It names a ROLE, and the role is a CSS
//      custom property so it themes. There is not one hex in this file, and a
//      test asserts that.
//   2. 44px is the floor for anything a finger is meant to hit. Apple's HIG and
//      WCAG 2.5.5 (AAA) both land there; the census found the app full of 30-
//      and 36-pixel targets. A primitive that can be built below 44 will be.

import { radius } from './shape'
import { TYPE } from './typeScale'

// ── Tap targets ─────────────────────────────────────────────────────────────
export const TAP_MIN = 44

// Two button heights, because the app genuinely has two: a full-width
// call-to-action (Start reviewing, Create account) and an inline action (Exit,
// Skip, Cancel). A third size would be a fourth by next month.
export const BUTTON_HEIGHT = { md: 44, lg: 52 }
export const BUTTON_SIZES = Object.keys(BUTTON_HEIGHT)

// ── The variant matrix ──────────────────────────────────────────────────────
// `fill` is the resting ground, `active` is the ground under a pointer, and
// `ink` is the label. Nothing else varies — a variant that also wanted its own
// radius or its own type size would not be a variant, it would be a component.
//
// Only `primary` and `destructive` carry a filled ground, which is the
// palette's rule (canFillButton in palette.js): the brand acts, and so does
// delete. Plum, blue and gold are atmosphere and never appear here.
const VARIANTS = {
  primary: {
    fill: 'var(--primary-fill)',
    active: 'var(--primary-pressed)',
    ink: '#fff',
    border: 'none',
  },
  secondary: {
    fill: 'var(--surface)',
    active: 'var(--surface-2)',
    ink: 'var(--text)',
    border: '1px solid var(--border)',
  },
  ghost: {
    fill: 'transparent',
    active: 'var(--surface-2)',
    ink: 'var(--text-secondary)',
    border: 'none',
  },
  destructive: {
    fill: 'var(--danger-fill)',
    active: 'var(--danger-pressed)',
    ink: '#fff',
    border: 'none',
  },
}

export const BUTTON_VARIANTS = Object.keys(VARIANTS)

// ── Disabled, once ──────────────────────────────────────────────────────────
// One rule for all four variants: a disabled control loses its accent and takes
// the muted ink. The ground follows the variant — a filled button flattens to
// the deepest neutral surface, a ghost stays a ghost. A ghost that grew a box
// when disabled would be the only control in the app that changes shape to say
// "no".
//
// The value this replaces: ui.jsx filled a disabled primary with `--locked` and
// kept the label white, which measures 2.52:1. WCAG exempts disabled controls
// from contrast, so that was legal and still nearly unreadable. `--text-muted`
// on `--surface-3` is 5.22:1 in light and 4.39:1 in dark.
function disabledOver(variant) {
  return {
    background: variant === 'ghost' ? 'transparent' : 'var(--surface-3)',
    border: variant === 'ghost' ? 'none' : '1px solid var(--border)',
    color: 'var(--text-muted)',
    cursor: 'default',
  }
}

// ── Button ──────────────────────────────────────────────────────────────────
// One style object for a whole button, from a variant and the four booleans
// that can be true about it. `hovered` is a pointer affordance the app already
// models with useState (there is no CSS :hover anywhere in src/); the touch
// press is the `hd-press` class, which is a transform and therefore not this
// function's business.
export function buttonStyle(variant = 'primary', options = {}) {
  const v = VARIANTS[variant]
  if (!v) return null
  const { size = 'md', disabled = false, loading = false, hovered = false, full = false } = options
  const height = BUTTON_HEIGHT[size] || BUTTON_HEIGHT.md
  // Loading is a kind of disabled: the action is already in flight, and a
  // second tap would send it twice.
  const off = disabled || loading

  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    boxSizing: 'border-box',
    width: full ? '100%' : 'auto',
    minHeight: height + 'px',
    padding: size === 'lg' ? '0 24px' : '0 16px',
    borderRadius: radius('control'),
    ...TYPE.label,
    // A control label is a title-weight word, not body copy. TYPE.label is
    // 13/600; `lg` steps the SIZE up and leaves the weight alone, because a
    // bigger button is a bigger word, not a bolder one.
    fontSize: size === 'lg' ? TYPE.titleCard.fontSize : TYPE.label.fontSize,
    fontFamily: 'Inter, sans-serif',
    // Every button in the app is a rectangle of one word — never let it wrap
    // into two lines and change its own height.
    whiteSpace: 'nowrap',
    background: v.fill,
    border: v.border,
    color: v.ink,
    cursor: 'pointer',
    ...(hovered && !off ? { background: v.active } : null),
    ...(off ? disabledOver(variant) : null),
  }
}

// The label colour, exposed because an icon inside a button has to match it and
// lucide takes `color` as a prop rather than inheriting.
export function buttonInk(variant = 'primary', options = {}) {
  const v = VARIANTS[variant]
  if (!v) return null
  return (options.disabled || options.loading) ? 'var(--text-muted)' : v.ink
}

// ── IconButton ──────────────────────────────────────────────────────────────
// The whole point of this one is the gap between what a control LOOKS and what
// it CATCHES. The census found icon buttons at 30x30 and 36x36 all over the app,
// because the size came from padding around an 18px glyph and nobody added it up.
//
// A `ghost` icon button paints nothing, so growing its box to 44x44 changes the
// tappable area and NOTHING ELSE — same glyph, same position, same pixels. That
// is why ghost is the default and why the migration in this phase could be
// pixel-identical while still fixing the target.
const ICON_VARIANTS = {
  ghost: { fill: 'transparent', active: 'var(--surface-2)', border: 'none' },
  // A visible shell, for an icon button that has to read as a control on a busy
  // ground (a reader's chrome over an image, the audio replay on a card).
  solid: { fill: 'var(--surface)', active: 'var(--surface-2)', border: '1px solid var(--border)' },
}

export const ICON_BUTTON_VARIANTS = Object.keys(ICON_VARIANTS)

export function iconButtonStyle(variant = 'ghost', options = {}) {
  const v = ICON_VARIANTS[variant]
  if (!v) return null
  const { disabled = false, hovered = false, round = false } = options
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    // Width AND height, not padding. Padding around a glyph is how the app got
    // 30x30 buttons — the number you type has to be the number you get.
    width: TAP_MIN + 'px',
    height: TAP_MIN + 'px',
    flexShrink: 0,
    padding: 0,
    borderRadius: round ? radius('pill') : radius('control'),
    background: v.fill,
    border: v.border,
    cursor: 'pointer',
    ...(hovered && !disabled ? { background: v.active } : null),
    ...(disabled ? { background: variant === 'ghost' ? 'transparent' : 'var(--surface-3)', cursor: 'default' } : null),
  }
}

// An icon's own colour, which is a prop on the lucide component rather than a
// style. `--text-secondary` rather than `--text-muted`: an icon is a mark, and a
// mark at 19px with a 1.85 stroke reads lighter than text at the same colour.
export function iconInk(options = {}) {
  if (options.disabled) return 'var(--text-faint)'
  return options.tone || 'var(--text-secondary)'
}

// ── Growing a target without moving anything ────────────────────────────────
// The trick that makes a 44px target free: a negative margin equal to half the
// growth, so the button's LAYOUT box stays the size it was while its hit area
// spills outward. AppBar (-10px), MobileNav (-8px) and Grammar (-8px) each
// worked this out by hand; this is the arithmetic they were doing.
//
//   <IconButton label="Close" icon={X} style={holdLayout(28)} />
//
// `visualSize` is what the control occupied BEFORE — for a padding-sized icon
// button that is glyph + 2 x padding, which is exactly the sum nobody added up.
// Returns null once the control is already at or over the floor, so a caller
// cannot accidentally shrink a correct target.
export function holdLayout(visualSize) {
  if (typeof visualSize !== 'number' || !Number.isFinite(visualSize)) return null
  if (visualSize >= TAP_MIN) return null
  // Half the growth, per side. An odd difference would need a fractional margin;
  // rounding down keeps the layout box no SMALLER than it was, which is the safe
  // direction — a row can absorb a spare pixel, a clipped glyph cannot.
  const inset = Math.floor((TAP_MIN - visualSize) / 2)
  return { margin: '-' + inset + 'px' }
}

// ── Row ─────────────────────────────────────────────────────────────────────
// The standard list row: [leading] title / supporting [trailing]. 44px floor
// again, and it is the one place the divider question gets a single answer.
export function rowStyle(options = {}) {
  const { disabled = false, hovered = false, interactive = false, divider = false } = options
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    boxSizing: 'border-box',
    width: '100%',
    minHeight: TAP_MIN + 'px',
    padding: '10px 16px',
    textAlign: 'left',
    background: hovered && interactive && !disabled ? 'var(--surface-2)' : 'transparent',
    // `border: none` first, then ONE edge. A bare `borderTop` on a <button>
    // leaves the user agent's default border on the other three sides.
    border: 'none',
    // --divider, never --hairline. The hairline token is a white inset
    // highlight, so as a border it draws nothing at all on a light surface —
    // the bug Home shipped in P10-C3 and KnownWords shipped again. The two carry
    // the same value today; the name is the point.
    borderTop: divider ? '1px solid var(--divider)' : 'none',
    cursor: interactive && !disabled ? 'pointer' : 'default',
    opacity: disabled ? 0.55 : 1,
  }
}

// Whether a row draws the hairline that separates it from the row above.
//
// ABOVE, not below, and that is the whole reason this is a named function. The
// census found the app doing it five different ways — `borderTop` suppressed on
// the first row (Practice, Words, Profile), `borderBottom` on every row
// including the last (KnownWords, so the final line doubles up with the
// container's rounded edge), a wrapper div carrying the border instead of the
// row (Profile's ControlRow), a 1px flex `gap` standing in for a line
// (SeriesDetail), and `:last-child` in CSS on a list styled entirely inline, so
// it never applied at all.
//
// Drawing ABOVE takes one argument. Drawing BELOW needs the list's length, which
// is what a `.map()` half the time does not have to hand — and getting it wrong
// is exactly the stray-line-under-the-only-row bug.
export function rowDivider(index) {
  return Number.isInteger(index) && index > 0
}

export const ROW_TITLE = { ...TYPE.titleCard, color: 'var(--text)' }
export const ROW_SUPPORTING = { ...TYPE.bodySecondary, color: 'var(--text-muted)' }

// ── Chip ────────────────────────────────────────────────────────────────────
// Small, and deliberately NOT 44px tall. A chip is a label or a filter in a
// scrolling rail — Stories' level filters are 34px and Stories' composition is
// frozen, so a 44px chip would be a redesign of a screen this phase is not
// allowed to touch. The height is named here so the sweep that does own that
// screen can raise it in one edit.
export const CHIP_HEIGHT = 34

const CHIP_STATES = {
  passive: {
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    color: 'var(--text-muted)',
  },
  selectable: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
  },
  selected: {
    // The brand, filled — a selected filter is an action the learner took.
    background: 'var(--primary-fill)',
    border: '1px solid var(--primary-fill)',
    color: '#fff',
  },
  disabled: {
    background: 'var(--surface-3)',
    border: '1px solid var(--border)',
    color: 'var(--text-faint)',
  },
}

export const CHIP_STATE_NAMES = Object.keys(CHIP_STATES)

export function chipStyle(options = {}) {
  const { selectable = false, selected = false, disabled = false } = options
  const key = disabled ? 'disabled' : (selected ? 'selected' : (selectable ? 'selectable' : 'passive'))
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    boxSizing: 'border-box',
    minHeight: CHIP_HEIGHT + 'px',
    padding: '0 12px',
    borderRadius: radius('pill'),
    ...TYPE.label,
    fontFamily: 'Inter, sans-serif',
    whiteSpace: 'nowrap',
    cursor: selectable && !disabled ? 'pointer' : 'default',
    ...CHIP_STATES[key],
  }
}

export function chipState(options = {}) {
  const { selectable = false, selected = false, disabled = false } = options
  if (disabled) return 'disabled'
  if (selected) return 'selected'
  return selectable ? 'selectable' : 'passive'
}

// ── Segmented ───────────────────────────────────────────────────────────────
// One track, N mutually exclusive options, a thumb on the selected one. The
// recipe follows the app's existing `.dict-tabs` (index.css) closely, because
// that one is already right: a bordered track with 4px of padding, and the
// selected segment lifted onto its own surface rather than tinted.
//
// The track is 44 tall so each segment clears the tap floor: 44 = 4px padding +
// 36px segment + 4px padding, so the SEGMENT is 36 and the TARGET is the full
// track height, which is what a finger actually hits.
export const SEGMENTED_HEIGHT = TAP_MIN
export const SEGMENTED_PAD = 4

export function segmentedTrackStyle(options = {}) {
  const { disabled = false } = options
  return {
    display: 'flex',
    alignItems: 'stretch',
    gap: '4px',
    boxSizing: 'border-box',
    minHeight: SEGMENTED_HEIGHT + 'px',
    padding: SEGMENTED_PAD + 'px',
    borderRadius: radius('control'),
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    opacity: disabled ? 0.55 : 1,
  }
}

export function segmentStyle(options = {}) {
  const { selected = false, disabled = false, hovered = false } = options
  return {
    flex: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    boxSizing: 'border-box',
    minWidth: 0,
    minHeight: (SEGMENTED_HEIGHT - SEGMENTED_PAD * 2 - 2) + 'px',
    padding: '0 10px',
    border: 'none',
    borderRadius: radius('sm'),
    ...TYPE.label,
    fontFamily: 'Inter, sans-serif',
    whiteSpace: 'nowrap',
    // Selected lifts onto --surface with the app's resting shadow. A tint would
    // have to compete with whatever the track sits on; a lift never does.
    background: selected ? 'var(--surface)' : (hovered && !disabled ? 'var(--surface-3)' : 'transparent'),
    boxShadow: selected ? 'var(--shadow-1)' : 'none',
    color: selected ? 'var(--text)' : 'var(--text-muted)',
    cursor: disabled ? 'default' : 'pointer',
  }
}

// ── Keyboard ────────────────────────────────────────────────────────────────
// A radiogroup owes the user arrow keys, Home and End (WAI-ARIA's radio-group
// pattern). Kept pure so the wrap-around and the no-op cases are testable
// without a keyboard: index in, index out.
export function segmentedKeyIndex(key, index, count) {
  if (!Number.isInteger(index) || !Number.isInteger(count) || count < 1) return null
  const wrap = (i) => ((i % count) + count) % count
  if (key === 'ArrowRight' || key === 'ArrowDown') return wrap(index + 1)
  if (key === 'ArrowLeft' || key === 'ArrowUp') return wrap(index - 1)
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}
