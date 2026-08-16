// The bottom-area contract: ONE definition of the space the floating tab dock
// occupies, and what everything else at the bottom of the screen must clear.
//
// Why this exists: the dock's clearance used to be re-derived by hand in four
// places — the page shell (94px), the feedback button (72px), the offline pill
// (80px) and the story reader's audio bar (62px). Each was tuned against a
// different generation of the navigation, so by the time the dock changed shape
// the feedback button was sitting ON it. A floating control must never overlap
// or compete with primary navigation, and that is a property of the SYSTEM, not
// of any one button — so the numbers live here and every consumer reads them.
//
// Geometry, bottom-up:
//
//   ┌─ content / floating controls ─────────────────┐
//   │                  gap                          │   CONTENT_GAP / FLOAT_GAP
//   │        ┌─ the dock ──────────────┐            │   DOCK_HEIGHT × DOCK_WIDTH
//   │        └─────────────────────────┘            │   (centred, fixed width)
//   │            max(safe-area, DOCK_INSET)         │   the dock's own offset
//   └───────────────────────────────────────────────┘
//
// `max(env(safe-area-inset-bottom), DOCK_INSET)` rather than a bare addition:
// on a notched phone the home indicator already supplies the breathing room, and
// adding to it floats the dock uncomfortably high; on a flat-bottomed phone
// (and every desktop browser) the inset is 0 and the dock still needs a margin.

// The floating dock itself. It is a COMPACT dock: a fixed-width control centred
// over the content, not a bar stretched to the viewport. The width is a
// constant rather than a percentage so the three destinations are the same
// size on every phone — a control that resizes with the screen is a footer, and
// this is meant to read as an object sitting above the page.
export const DOCK_HEIGHT = 58
// One destination: 88 × 46 is comfortably past the 44px touch minimum in both
// directions while keeping the whole dock narrower than the narrowest phone.
export const DOCK_SEGMENT = 88
export const DOCK_SEGMENT_HEIGHT = 46
// The shell around the three segments.
export const DOCK_PADDING = 6
export const DOCK_WIDTH = DOCK_SEGMENT * 3 + DOCK_PADDING * 2
// Its minimum distance from the bottom edge — the floor under the safe area.
export const DOCK_INSET = 12
// The narrowest phone we support. The dock must still clear both edges there,
// which is what pins DOCK_WIDTH: 276 leaves 22px a side at 320.
export const MIN_VIEWPORT = 320
export const DOCK_MIN_SIDE_MARGIN = (MIN_VIEWPORT - DOCK_WIDTH) / 2
// Breathing room between the dock and the page content scrolling under it.
export const CONTENT_GAP = 14
// …and between the dock and a floating control parked above it.
export const FLOAT_GAP = 12
// What a focused screen (no dock: Study, the reader) leaves at the bottom
// instead — enough that content never touches the edge.
export const FOCUS_GAP = 16

// The dock's own `bottom`.
export function dockBottom() {
  return 'max(env(safe-area-inset-bottom), ' + DOCK_INSET + 'px)'
}

// Bottom padding for the scrolling page area. `navVisible: false` (Study, the
// reader) drops to the focused value, so a hidden dock never reserves space.
export function contentBottomInset(navVisible = true) {
  if (!navVisible) return 'calc(' + FOCUS_GAP + 'px + env(safe-area-inset-bottom))'
  return 'calc(' + (DOCK_HEIGHT + CONTENT_GAP) + 'px + ' + dockBottom() + ')'
}

// `bottom` for a control that floats above the dock (feedback, offline pill,
// the reader's audio bar). Same contract, slightly tighter gap.
export function floatingBottom(navVisible = true) {
  if (!navVisible) return 'calc(' + FOCUS_GAP + 'px + env(safe-area-inset-bottom))'
  return 'calc(' + (DOCK_HEIGHT + FLOAT_GAP) + 'px + ' + dockBottom() + ')'
}

// Whether the dock is shown for a given view.
//
// This is the resting/focused distinction the whole product model turns on. At
// REST — Today's card, the story doorway, the practice prompt, the done state,
// and the Stories and Practice destinations — navigation is present and easy to
// reach, because the learner must always be able to say "not now, I want to
// browse". In FOCUSED work — a grading session, the reader, a drill that is
// answering questions rather than choosing them — the screen belongs to the
// task: each has its own way out, and a tab bar there is both a distraction and
// a collision risk.
//
// Listed by view, except the story reader: it opens INSIDE the `stories` view,
// so it declares itself through navFocus.js instead.
const NAV_FREE_VIEWS = new Set([
  // Flashcards.
  'study', 'weak',
  // The level test — an assessment owns the screen.
  'test',
  // Drills: you are answering, not browsing.
  'fillblank', 'builder', 'speak', 'tones', 'grammarpractice', 'strokes', 'writing',
  // Script drills (frozen tracks, same rule — shared code, no special case).
  'kana', 'cyrillic',
])

export function navVisibleFor(view, { focused = false } = {}) {
  if (focused) return false
  return !NAV_FREE_VIEWS.has(view)
}
