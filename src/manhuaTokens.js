// The paper palette for Hanzi Dojo Stories — the manhua reader's own surface.
//
// Every other screen themes off the semantic tokens in index.css, and must:
// a hardcoded neutral there is a bug (CLAUDE.md §5). This file is the one
// documented exception, and it follows a precedent the repo already set —
// `chatStyleFor` (chatMissions.js) paints the chat readers' messaging-app
// chrome rather than the app's surfaces, for the same reason.
//
// The reason is that the paper IS the artwork here. A manhua panel is a
// monochrome ink drawing carrying its own paper tone; float it on a themed
// surface and in dark mode you get a bright rectangle punched through a dark
// page — the panel stops reading as paper and starts reading as a photo. So the
// reader owns one register, warm ivory, on both themes: the page around the
// panels is made of the same paper the panels are drawn on.
//
// The accent is NOT hardcoded here. It comes from `languageTheme()` like
// everywhere else, so this reader inherits the language's identity instead of
// asserting one — the cinnabar below is Chinese's own `accentHex`, arrived at
// from the data, and ACTIVE is only the lighter pressed state that has no
// equivalent in the theme.

export const PAPER = {
  // The page the strip of panels sits on, and the panel's own paper.
  page: '#FAF8F3',
  panel: '#F4EFE5',
  // Ink, in three weights: the text, its quieter companion, and metadata.
  ink: '#171411',
  ink2: '#423D37',
  muted: '#746D64',
  faint: 'rgba(23, 20, 17, 0.42)',
  // The pressed/selected state of an accent. The resting accent is the
  // language's own — see manhuaAccent().
  active: '#D45143',
  // Lantern light: the one warm non-red accent, used for the reading progress
  // track and the completion mark.
  gold: '#C4964A',
  // Surfaces drawn ON the paper.
  bubble: 'rgba(255, 255, 255, 0.96)',
  card: '#FFFDF9',
  // Edges. A printed comic is drawn in ink, not in grey UI hairlines: `frame` is
  // the black keyline around a panel and around a balloon, `hairline` and `soft`
  // stay for the cards and dividers that are interface rather than page.
  frame: '#171411',
  hairline: 'rgba(23, 20, 17, 0.14)',
  soft: 'rgba(23, 20, 17, 0.08)',
  // Warm, low shadows — a page lit from above, not a UI card floating in space.
  // Panels and balloons take NONE of this: ink on paper does not cast a shadow,
  // and a shadow under a balloon is the single thing that made this read as a
  // messaging app rather than a comic.
  shadow: '0 1px 2px rgba(23, 20, 17, 0.06), 0 8px 24px -12px rgba(23, 20, 17, 0.22)',
  shadowLift: '0 2px 4px rgba(23, 20, 17, 0.08), 0 14px 32px -14px rgba(23, 20, 17, 0.28)',
}

// The reading column. Mobile is the design; desktop centres the same column
// rather than widening into a dashboard.
export const COLUMN_MAX = 520

// Panel and balloon geometry, taken from the reference page.
//
// A panel on a comic page is a rectangle with a black keyline and a white
// gutter around it — not a rounded card. The radius here is 3px rather than 0
// only so the corner does not alias harshly against the artwork; anything
// larger and the panel reads as a UI card again.
export const PANEL_RADIUS = 3
export const PANEL_FRAME = 2          // the keyline's weight, in px
export const GUTTER = 12              // white space between panels

// Speech and thought silhouettes are SVG paths in ManhuaBubble: CSS radii made
// short copy look like a UI pill and could not draw a real cloud edge or tail.
// Narration is the exception: a caption plate is a hard-edged box in print.
export const NARRATION_RADIUS = 2

// Cards below the page (the choice, the closing plate) are interface, not
// artwork, and keep the app's softer geometry.
export const CARD_RADIUS = 22
export const OPTION_RADIUS = 16

// Nothing tappable is smaller than this.
export const TAP_TARGET = 44

// The type ramp. Chinese is the largest thing on the page by a wide margin —
// pinyin and English are deliberately quieter so the hanzi is what the eye
// lands on, which is the whole reason the learner is reading at all.
export const TYPE = {
  hanzi: '21px',
  hanziNarration: '18px',
  pinyin: '12.5px',
  english: '13px',
  speaker: '11px',
  meta: '11.5px',
}

// The reading font stack. `languageTheme().font` first (Noto Sans SC for
// Chinese), then real system CJK faces, so a device without the web font still
// draws sharp hanzi instead of falling back to a Latin face with tofu.
export function manhuaFontStack(themeFont) {
  return (themeFont ? themeFont + ', ' : '')
    + "'Noto Sans SC', 'Source Han Sans SC', 'PingFang SC', 'Hiragino Sans GB', "
    + "'Microsoft YaHei', 'Heiti SC', sans-serif"
}

// The resting accent for this reader: the language's own, from languageTheme.
// Falls back to Chinese cinnabar only if a caller passes nothing.
export function manhuaAccent(theme) {
  return (theme && theme.accentHex) || '#B83A24'
}

// The reader's sticky bar box.
//
// Two rules a phone taught us, kept here rather than inline so they are tested
// once instead of re-derived by every bar this reader ever grows:
//
//   1. OPAQUE. The bar used to be 88% paper over a backdrop-filter blur. That
//      filter is unreliable inside an iOS WKWebView, and a full-bleed ink panel
//      scrolling under a translucent bar is exactly the artwork you can read
//      through the title. A reader's only chrome outranks the picture.
//   2. It COVERS THE NOTCH. The native shell draws under the status bar
//      (viewport-fit=cover, iOS contentInset "never") and App.jsx pads that
//      inset once on <main>. A sticky bar pinned BELOW the inset leaves a strip
//      of live artwork scrolling behind the clock — so this cancels the shell's
//      padding with a negative margin and re-adds it as its own padding. The
//      bar lands in exactly the same place at scroll-0, but its background now
//      reaches the top of the screen once pinned.
export function stickyPaperBar(zIndex) {
  return {
    position: 'sticky',
    top: 0,
    zIndex: zIndex || 5,
    marginTop: 'calc(-1 * env(safe-area-inset-top, 0px))',
    paddingTop: 'env(safe-area-inset-top, 0px)',
    background: PAPER.page,
  }
}

// A tint of the accent mixed INTO the paper, never an alpha hex — the same rule
// the themed screens follow, applied to this reader's fixed paper.
export function accentTint(accentHex, pct) {
  return 'color-mix(in srgb, ' + accentHex + ' ' + pct + '%, ' + PAPER.panel + ')'
}
