// The dimensional glyph family, in bar order.
//
// Lives outside navGlyphs.jsx because a `.jsx` file may only export components
// (react-refresh, CLAUDE.md §3) — the same split navConfig.js makes against
// NavIcons.jsx. One ordered list, so a gallery, a test and (in P14-4) the tray
// itself cannot disagree about which glyph belongs to which destination.
//
// `key` is the app's own view key, so it lines up with navConfig.js: the Cards
// destination is `study`, not `cards`.
import { HomeGlyph, StoriesGlyph, CardsGlyph, PracticeGlyph, ProfileGlyph } from './navGlyphs'

export const NAV_GLYPHS = [
  { key: 'home', label: 'Home', Glyph: HomeGlyph },
  { key: 'stories', label: 'Stories', Glyph: StoriesGlyph },
  { key: 'study', label: 'Cards', Glyph: CardsGlyph },
  { key: 'practice', label: 'Practice', Glyph: PracticeGlyph },
  { key: 'profile', label: 'Profile', Glyph: ProfileGlyph },
]

// The sizes the family has to survive. 32 is where it is authored; 20 is the
// smallest anything on the bar has ever been drawn (More, NAV_ICON_PX.more).
export const GLYPH_SIZES = [20, 24, 28, 32]
