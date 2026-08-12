// Geometry for the flashcard study screen.
//
// Why this exists: on a phone the study screen has to fit ONE viewport. Grading
// is the single most-repeated action in the app — dozens of times per session —
// so a screen that grows past the fold and makes the learner scroll down to
// reach Again/Hard/Good/Easy turns one tap into a scroll plus a tap, every card.
//
// So on mobile the screen is height-locked to the dynamic viewport (minus the
// fixed bottom nav) and laid out as a flex column: the header rail and the grade
// band are pinned, and the card takes whatever is left and scrolls its own
// contents when a word has an unusually long example. Desktop is untouched — it
// keeps the tall `minHeight: 100vh` page and the 420px card.
//
// All of it is plain arithmetic so it can be tested without a browser.

// What the bottom navigation claims, which App.jsx already reserves as `main`'s
// bottom padding. The study shell must subtract the same amount or the page ends
// up exactly one nav-bar taller than the viewport — so it takes the number from
// navMetrics.js rather than keeping a second copy, which is the mistake that put
// 4.25px of dead space under every screen.
//
// P14-4: the RESERVE, not the tray's own height. The tray floats clear of the
// bottom edge now, so the space a screen has to keep free is the tray plus its
// float — 66px, against the 58px flush bar. That is 8px off the flashcard on a
// phone with no home-indicator inset, and the float floor was chosen at 6 rather
// than 8 precisely so no current device changes density band (see navMetrics.js).
import { MOBILE_NAV_RESERVE } from './navMetrics'

// Never render a grade button smaller than a comfortable thumb.
export const MIN_TAP_TARGET = 44

// The desktop card keeps its original fixed height.
export const DESKTOP_CARD_MIN_HEIGHT = 420

// Breakpoints on the height actually available below the nav bar.
const ROOMY_MIN = 700   // e.g. 390x844 → 782 available
const COMPACT_MIN = 600 // e.g. 375x700 → 638 available
// anything shorter is "tight" — e.g. 360x640 → 578 available

const PRESETS = {
  desktop: {
    shellPadding: '20px 32px 36px',
    headerGap: 14,
    titleSize: 28,
    subtitleAllowed: true,
    cardMinHeight: DESKTOP_CARD_MIN_HEIGHT,
    cardPadding: 24,
    contentPadding: '34px 24px',
    wordSize: 90,
    meaningSize: 19,
    footerMinHeight: 42,
    footerPadTop: 18,
    showFooterHint: true,
    gradeTopGap: 14,
    gradeGap: 10,
    gradeMinHeight: 76,
    gradeLabelSize: 14,
    gradeIntervalSize: 11,
  },
  roomy: {
    shellPadding: '12px 14px 10px',
    headerGap: 12,
    titleSize: 24,
    subtitleAllowed: true,
    cardMinHeight: 0,
    cardPadding: 18,
    contentPadding: '20px 12px',
    wordSize: 76,
    meaningSize: 18,
    footerMinHeight: 34,
    footerPadTop: 12,
    showFooterHint: true,
    gradeTopGap: 12,
    gradeGap: 9,
    gradeMinHeight: 68,
    gradeLabelSize: 14,
    gradeIntervalSize: 11,
  },
  compact: {
    shellPadding: '10px 14px 8px',
    headerGap: 10,
    titleSize: 21,
    subtitleAllowed: true,
    cardMinHeight: 0,
    cardPadding: 14,
    contentPadding: '14px 10px',
    wordSize: 64,
    meaningSize: 17,
    footerMinHeight: 28,
    footerPadTop: 10,
    showFooterHint: true,
    gradeTopGap: 10,
    gradeGap: 8,
    gradeMinHeight: 60,
    gradeLabelSize: 13.5,
    gradeIntervalSize: 10.5,
  },
  tight: {
    shellPadding: '8px 12px 6px',
    headerGap: 8,
    titleSize: 19,
    subtitleAllowed: false,
    cardMinHeight: 0,
    cardPadding: 12,
    contentPadding: '10px 8px',
    wordSize: 54,
    meaningSize: 16,
    footerMinHeight: 0,
    footerPadTop: 8,
    showFooterHint: false,
    gradeTopGap: 8,
    gradeGap: 7,
    gradeMinHeight: 52,
    gradeLabelSize: 13,
    gradeIntervalSize: 10,
  },
}

// Order matters: `studyLayout` guarantees values only ever shrink along it.
export const DENSITIES = ['desktop', 'roomy', 'compact', 'tight']

// How much vertical room a card screen actually gets on a phone.
//
// `reserved` is what something else has already claimed at the bottom — the tab
// bar, normally. The onboarding tutorial runs outside the app shell and has no
// tab bar, so it passes 0 and gets the whole screen; everything else takes the
// default and behaves exactly as it always has.
export function availableHeight(viewportHeight, reserved = MOBILE_NAV_RESERVE) {
  return Math.max(0, (viewportHeight || 0) - reserved)
}

// Pick the density band for a viewport.
export function studyDensity(isMobile, viewportHeight, reserved = MOBILE_NAV_RESERVE) {
  if (!isMobile) return 'desktop'
  const available = availableHeight(viewportHeight, reserved)
  if (available >= ROOMY_MIN) return 'roomy'
  if (available >= COMPACT_MIN) return 'compact'
  return 'tight'
}

// The CSS height the study shell is locked to on mobile. `dvh` (not `vh`) so
// the browser's collapsing address bar doesn't make it a chunk too tall, and
// BOTH safe-area insets subtracted, because App.jsx reserves both around
// `main`: the nav padding at the bottom AND `env(safe-area-inset-top)` above.
// Missing the top inset made the locked shell taller than the screen by
// exactly the notch (~59px on an iPhone 14) — a scroll to reach the grade
// buttons on every card, invisible to the Chromium e2e where insets are 0.
export function shellHeightCss(reserved = MOBILE_NAV_RESERVE) {
  return 'calc(100dvh - ' + reserved + 'px' +
    ' - env(safe-area-inset-bottom) - env(safe-area-inset-top))'
}

export const MOBILE_SHELL_HEIGHT = shellHeightCss()

/**
 * Everything the study screen needs to size itself.
 *
 * @param {object} opts
 * @param {boolean} opts.isMobile   below the mobile breakpoint
 * @param {number}  opts.viewportHeight  window.innerHeight
 * @param {number}  opts.banners    how many optional banners are showing above
 *                                  the card (save error, first-mission hint …)
 * @param {number}  opts.reservedBottom  what is already claimed below the card
 *                                  (the tab bar, by default; 0 outside the shell)
 */
export function studyLayout({ isMobile, viewportHeight, banners, reservedBottom = MOBILE_NAV_RESERVE } = {}) {
  const density = studyDensity(isMobile, viewportHeight, reservedBottom)
  const preset = PRESETS[density]
  const bannerCount = banners || 0

  // A banner costs roughly a header sub-line. On an already-short screen, drop
  // the "HSK 2 · Chinese" subtitle rather than eat into the card.
  const showSubtitle = preset.subtitleAllowed
    && !(density !== 'roomy' && density !== 'desktop' && bannerCount > 0)

  return {
    ...preset,
    density,
    banners: bannerCount,
    showSubtitle,
    // True when the shell is height-locked and laid out as a flex column.
    fixed: density !== 'desktop',
    shellHeight: density === 'desktop' ? null : shellHeightCss(reservedBottom),
    available: density === 'desktop' ? null : availableHeight(viewportHeight, reservedBottom),
    // The card is the only element allowed to give up space.
    cardFlex: density === 'desktop' ? null : 1,
  }
}
