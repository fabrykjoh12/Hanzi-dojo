// Where an anchored popover goes.
//
// The story readers used to answer "what does this word mean?" in a sheet glued
// to the bottom of the screen: the learner's eyes are on a word in the middle of
// the page and the answer arrives somewhere else entirely. This module places
// the box directly ABOVE the tapped word instead, with an arrow pointing back at
// it, so the question and the answer are the same object on the page.
//
// Pure geometry, no DOM: the component measures, this decides, the component
// applies. That split is what makes the awkward cases (a word on the last line,
// a word hard against the left edge, a definition taller than the screen)
// testable rather than something you can only find by tapping around.

// Breathing room between the popover and the word it points at. Big enough that
// the arrow reads as a pointer rather than a seam.
export const POPOVER_GAP = 12
// Smallest distance the popover keeps from any viewport edge.
export const POPOVER_MARGIN = 12
// How far the arrow stays from the popover's own corners, so it never lands on
// a rounded corner and looks broken.
export const ARROW_INSET = 20
// Below this, an anchored popover is a scrollbar with a title in it — the caller
// is better off with the bottom sheet, which owns the full width.
export const MIN_POPOVER_HEIGHT = 132

function clamp(value, low, high) {
  if (high < low) return low
  return Math.max(low, Math.min(high, value))
}

// Normalizes a DOMRect (or a plain object standing in for one) so callers can
// pass either. Only top/left/width/height are required.
function normalizeRect(rect) {
  const top = rect.top || 0
  const left = rect.left || 0
  const width = rect.width != null ? rect.width : ((rect.right || 0) - left)
  const height = rect.height != null ? rect.height : ((rect.bottom || 0) - top)
  return { top, left, width, height, bottom: top + height, right: left + width }
}

// The vertical room on each side of the anchor, once the edge margin and the gap
// are paid for. Exported because "how much room is there?" is also the question
// the caller asks when it needs a max-height before it has measured anything.
export function popoverSpace(anchorRect, viewport, opts) {
  const o = opts || {}
  const margin = o.margin != null ? o.margin : POPOVER_MARGIN
  const gap = o.gap != null ? o.gap : POPOVER_GAP
  const anchor = normalizeRect(anchorRect)
  return {
    above: anchor.top - margin - gap,
    below: viewport.height - anchor.bottom - margin - gap,
  }
}

// True while the anchored word is still somewhere on screen. A popover pinned to
// a word that has scrolled away points at nothing, so the caller closes it
// rather than leaving it stranded mid-air.
export function anchorInView(anchorRect, viewport) {
  const anchor = normalizeRect(anchorRect)
  if (anchor.bottom <= 0 || anchor.top >= viewport.height) return false
  if (anchor.right <= 0 || anchor.left >= viewport.width) return false
  return true
}

// Place a measured popover against its anchor.
//
//   anchorRect  the tapped word's rect, viewport-relative (getBoundingClientRect)
//   size        the popover's own measured { width, height }
//   viewport    { width, height }
//   opts        { margin, gap, arrowInset, minHeight }
//
// Returns { fits: false } when the box cannot be given a usable height on either
// side — the caller falls back to the bottom sheet, which is a real answer
// rather than a broken popover. Otherwise:
//
//   { fits: true, placement, top, left, height, maxHeight, arrowLeft }
//
// `top`/`left` are viewport coordinates for a position:fixed box. `maxHeight` is
// the room actually available on the chosen side: apply it with overflow-y auto
// and long content scrolls inside the popover instead of off the screen.
// `height` is what the box will actually occupy once that cap is applied — the
// arrow needs it to sit on the box's edge.
// `arrowLeft` is the arrow's centre, measured from the popover's own left edge —
// it keeps tracking the word after the box has been clamped away from it, which
// is the whole reason the box is what gets clamped.
export function placePopover(anchorRect, size, viewport, opts) {
  const o = opts || {}
  const margin = o.margin != null ? o.margin : POPOVER_MARGIN
  const gap = o.gap != null ? o.gap : POPOVER_GAP
  const arrowInset = o.arrowInset != null ? o.arrowInset : ARROW_INSET
  const minHeight = o.minHeight != null ? o.minHeight : MIN_POPOVER_HEIGHT

  const anchor = normalizeRect(anchorRect)
  const space = popoverSpace(anchor, viewport, { margin, gap })

  // Above is the preference: it keeps the word, the arrow and the answer in one
  // upward glance, and on a phone it stays clear of the thumb. Below is the flip
  // for a word near the top of the screen. If neither side can hold the whole
  // box, take the roomier side and let the content scroll inside it — but only
  // while that side is still tall enough to read in.
  let placement = null
  if (space.above >= size.height) placement = 'above'
  else if (space.below >= size.height) placement = 'below'
  else if (Math.max(space.above, space.below) >= minHeight) {
    placement = space.above >= space.below ? 'above' : 'below'
  }
  if (!placement) return { fits: false }

  const maxHeight = placement === 'above' ? space.above : space.below
  // The height the box will actually occupy: its natural height, or the room it
  // has, whichever is smaller. Deriving `top` from that (not from the natural
  // height) is what keeps a scrolling popover's bottom edge pinned to the word.
  const height = Math.min(size.height, maxHeight)
  const top = placement === 'above'
    ? anchor.top - gap - height
    : anchor.bottom + gap

  // Centre on the word, then clamp the whole box inside the viewport. The box
  // moves; the arrow does not follow it.
  const centerX = anchor.left + anchor.width / 2
  const left = clamp(centerX - size.width / 2, margin, viewport.width - margin - size.width)

  // The arrow is clamped in turn, so a word in the far corner still gets an
  // arrow inside the popover's rounded corners rather than one hanging off it.
  const arrowLeft = clamp(centerX - left, arrowInset, size.width - arrowInset)

  return { fits: true, placement, top, left, height, maxHeight, arrowLeft }
}
