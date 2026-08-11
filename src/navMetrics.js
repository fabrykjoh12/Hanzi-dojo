// How much bottom edge the mobile navigation bar occupies.
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
// The height is DECLARED now, here, and the bar is given it rather than growing
// into it — so the two can no longer drift apart, whatever happens to the
// padding or the label's font. 58px is what the bar already rendered as,
// rounded up: this commit is fixing the drift, not redesigning the bar, and a
// tester on build 33 should not be able to see the difference.
export const MOBILE_NAV_HEIGHT = 58

// The same value as CSS, with the home-indicator inset added once. Everything
// that reserves the bar — the bar's own height, `main`'s bottom padding, the
// immersive reader's bottom offset — reads this one string, so there is nothing
// left to keep in step by hand.
export const MOBILE_NAV_SPACE = 'calc(' + MOBILE_NAV_HEIGHT + 'px + env(safe-area-inset-bottom))'
