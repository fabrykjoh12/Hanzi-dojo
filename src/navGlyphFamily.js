// The dimensional glyph family, split into the set that is navigation and the set
// that is not.
//
// Lives outside navGlyphs.jsx because a `.jsx` file may only export components
// (react-refresh, CLAUDE.md §3) — the same split navConfig.js makes against
// NavIcons.jsx. One ordered list, so a gallery, a test and (in P14-4) the tray
// itself cannot disagree about which glyph belongs to which destination.
import {
  HomeGlyph, StoriesGlyph, CardsGlyph, PracticeGlyph, MoreGlyph, ProfileGlyph,
} from './navGlyphs'

// The production bottom bar, in the order it ships: Home · Stories · Cards ·
// Practice · More, with Cards centred. This list IS the bar's list — it is not a
// proposal, and nothing here changes navConfig.js.
//
// `key` is the app's own view key, so it lines up with navConfig.js: the Cards
// destination is `study`, and `more` is the sheet rather than a screen.
export const NAV_GLYPHS = [
  { key: 'home', label: 'Home', Glyph: HomeGlyph },
  { key: 'stories', label: 'Stories', Glyph: StoriesGlyph },
  { key: 'study', label: 'Cards', Glyph: CardsGlyph },
  { key: 'practice', label: 'Practice', Glyph: PracticeGlyph },
  { key: 'more', label: 'More', Glyph: MoreGlyph },
]

// Drawn to the same rules, deliberately NOT on the bar.
//
// Profile is reached the way it is reached today — from the More sheet — and this
// glyph is for that screen's own header, its avatar affordance, and whatever P14-4
// or later does with identity. Putting it on the bar would mean removing More,
// which is a navigation-architecture change and not a visual one. Keeping the two
// arrays apart is what stops that happening by accident: a tray that maps over
// NAV_GLYPHS cannot pick Profile up.
export const IDENTITY_GLYPHS = [
  { key: 'profile', label: 'Profile', Glyph: ProfileGlyph },
]

export const ALL_GLYPHS = [...NAV_GLYPHS, ...IDENTITY_GLYPHS]

// The sizes the family has to survive being drawn at. 32 is where it is authored;
// 20 is the smallest anything on the bar has ever been (More, NAV_ICON_PX.more).
export const GLYPH_SIZES = [20, 24, 28, 32]

// ── The ramp this family wants ──────────────────────────────────────────────
// A RECOMMENDATION, not the bar. `NAV_ICON_PX` in navEmphasis.js is what MobileNav
// actually uses and P14-3 does not touch it; adopting these is P14-4's call.
//
// The glyphs themselves are all one weight now (136–145 px² of ink at 22px), so
// every bit of the bar's visual hierarchy comes from this table. Measured, it lands
// at Cards 203 · Stories 168 · Practice 165 · Home 149 · More 140 px² — Cards
// clearly first, Stories and Practice at 81–83% of it, Home and More quieter, and
// a 1.45x spread top to bottom.
//
// 81–83% is not a coincidence: it is where P8 left Practice relative to Cards on
// the bar that passed device QA, which makes it the one number in this table with
// evidence behind it rather than taste.
//
// The bar's own ramp is steeper — 27.5 down to 20, a 1.89x area ratio all by
// itself — which put Stories at 62% of Cards even after the drawings were
// balanced. Emphasis on the bar is also carried by the Cards container, the centre
// column and the bold label (navEmphasis.js), so the glyph sizes do not have to do
// all of it, and when they try, the row stops looking like one set of objects.
export const NAV_GLYPH_PX = {
  study: 26,
  stories: 24,
  practice: 23.5,
  home: 23,
  more: 22,
}

export function navGlyphPx(key) {
  return NAV_GLYPH_PX[key] || NAV_GLYPH_PX.home
}
