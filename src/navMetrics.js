// How much bottom edge the mobile navigation occupies, and where it sits.
//
// This used to be two numbers pretending to be one. The bar's height was
// EMERGENT — 9px of padding, a 22px icon, a 3px gap, a 10.5px label's line box,
// 7px more padding and a 1px border, which rendered at 57.75px — while App.jsx
// and studyLayout.js reserved a flat 62px they had been told once, years of
// edits ago. Every screen therefore carried a 4.25px dead strip above the bar,
// and the flashcard on a 568px phone was 4px shorter than it needed to be.
// `geometry.spec.js` asserted the bar's position within ±8px, which is exactly
// wide enough for that to hide in.
//
// The height is DECLARED here, and the bar is given it rather than growing into
// it — so the two can no longer drift apart, whatever happens to the padding or
// the label's font.
//
// ── P14-4: the bar became a floating tray ───────────────────────────────────
// It is no longer a full-width slab flush to the bottom edge. It is inset from
// both sides, rounded on all four corners, solid rather than glass, and it floats
// clear of the bottom edge — so "how tall is the bar" and "how much bottom edge
// must a screen keep clear" are now genuinely two different questions, and both
// are answered here.

// ── The object ──────────────────────────────────────────────────────────────

// The tray's own height. 58 → 60: two more pixels than the flush bar, which buys
// the column a pixel of breathing room at the top and bottom now that there is a
// border on both edges instead of one. The brief's range was 60–64; 60 is the
// bottom of it because every pixel here comes off the flashcard (below).
export const MOBILE_NAV_HEIGHT = 60

// Inset from each screen edge. 12 measured best of 10/12/14 across 320/390/430:
// at 10 the tray reads as a slab with the corners rounded rather than as a detached
// object, and 14 spends four more pixels of the narrowest row than the float needs.
// At 12 the 320px phone's tab column measures 58.8px against a 44px floor.
//
// It also makes the column width fractional — 320 − 24 − 2 borders = 294, and
// 294/5 = 58.8 — which the old full-width bar never had to deal with (390/5 = 78).
// Chromium hands the remainder out differently on different builds: identical
// fractional widths locally, two values that differ in the second decimal on the CI
// runner. No inset fixes that for every phone width (i ≡ 4 mod 5 works at
// 320/390/430 and fails at 412/414), so the specs assert the CONTRACT — no column
// more than half a pixel wider than another — rather than an engine's rounding.
export const NAV_TRAY_INSET = 12

// The MINIMUM float above the bottom edge. On any phone with a home-indicator
// inset the inset itself provides the float and this floor never applies; it
// exists for the devices that have none (iPhone SE, most Android) where a tray
// pinned to the very edge would not read as floating at all.
export const NAV_TRAY_FLOAT = 6

// Where the tray's bottom edge sits.
//
// `max()`, not `+`. This is the safe-area decision, and it is deliberate: the
// tray's bottom edge lands ON the safe-area boundary, which is exactly where iOS
// says interactive content should stop, and the home-indicator strip below it
// stays PAGE GROUND rather than becoming part of the tray. The alternative —
// float + inset — would put the tray 40px up on a modern iPhone and cost every
// screen another 6px for nothing.
//
// The strip below the tray is not a gap: it is the page, with the page's own
// background drawn through it (Background.jsx is a fixed full-viewport layer).
// A painted "support region" was considered and rejected for exactly that reason
// — an opaque band over a fixed background image cuts the image off with a visible
// seam, which looks like the bug it is trying to prevent.
export const NAV_TRAY_BOTTOM = 'max(' + NAV_TRAY_FLOAT + 'px, env(safe-area-inset-bottom))'

// The tray's corner, as a NAME from the radius scale rather than a value.
//
// The brief asked for ~20–24 and the scale does not have one: `RADIUS` is 8 /
// 12 / 18 / 26 / 999, and adding a sixth value to it is a design-system decision,
// not a tray decision. Both neighbours were rendered at 320/390/430 in both
// themes. `hero` (26) on a 60px tray is 43% of its height — the short ends go
// almost semicircular and it reads as a pill someone stopped rounding, which is
// the "different control" the brief rules out. `card` (18) is 30%, it is the
// radius every card in the app already uses, and it is the radius the More sheet
// hinges on — so the sheet rises out of the tray in the same shape.
export const NAV_TRAY_RADIUS_NAME = 'card'

// ── The space it claims ─────────────────────────────────────────────────────

// What a screen must keep clear at the bottom, as a NUMBER, for the worst case —
// a device with no home-indicator inset, where the float floor applies. This is
// the value the study screen's density arithmetic uses, because a band boundary
// has to be decided without a browser.
//
// 66 rather than 58 is +8px off the flashcard on an inset-less phone. It was
// chosen against studyLayout's own thresholds rather than by eye: COMPACT_MIN is
// 600, and a 667px-tall phone (iPhone SE 2/3, iPhone 8 — the shortest device the
// app supports with a modern viewport) has 601px left at 66 and 599px at 68. A
// 60px tray with an 8px float would have pushed that whole class of phone from
// `compact` to `tight`, which is a visible Study change, and P14-4 is not allowed
// one. That is the entire reason the float floor is 6 and not 8.
export const MOBILE_NAV_RESERVE = MOBILE_NAV_HEIGHT + NAV_TRAY_FLOAT

// The same reservation as CSS, with the home-indicator inset resolved. Everything
// that reserves the navigation — `main`'s bottom padding, the immersive reader's
// bottom offset, the feedback button's offset — reads this one string, so there is
// nothing left to keep in step by hand.
export const MOBILE_NAV_SPACE =
  'calc(' + MOBILE_NAV_HEIGHT + 'px + ' + NAV_TRAY_BOTTOM + ')'
