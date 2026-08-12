// The typography scale — P14-0, docs/P13-VISUAL-DIRECTION-AUDIT.md §7.
//
// The census found 60 distinct type styles across 11 screens: 26 font sizes
// (9.5 → 112px) and 10 weights, including 500, 550, 650, 750, 820 and 850. Most
// of those differences are invisible and all of them are maintenance. This file
// is 12 roles, 9 UI sizes and 4 weights.
//
// Why a module and not a comment: 60 styles is exactly what happens when the
// scale lives in prose. A role has to be cheaper to reach for than a hand-typed
// fontSize, or it will not be adopted.
//
// ── The four weights ────────────────────────────────────────────────────────
// 400 body · 600 label · 700 title · 800 display. Nothing between them. The
// eyebrow keeps 800 because it is small-caps at 10.5px, where 700 goes soft.
//
// ── Content vs UI ───────────────────────────────────────────────────────────
// `hanziDisplay`, `hanziInline`, `pinyin` and `definition` are CONTENT, not part
// of the UI scale — they are the language itself and they answer to legibility,
// not to hierarchy. They are here so there is one place to find them, and they
// are excluded from the UI-size count.
//
// Spread these into inline style objects (house style, CLAUDE.md §6-3):
//   <h1 style={{ ...TYPE.titleScreen, color: 'var(--text)' }}>
//
// P14-0 defines them. The sweep that applies them app-wide is P14-2.

export const WEIGHT = {
  body: 400,
  label: 600,
  title: 700,
  display: 800,
}

// The UI scale, in descending size. `lineHeight` is unitless on purpose so it
// scales with the size; `letterSpacing` only appears where it earns its place.
export const TYPE = {
  // The one number a screen is about — Home's card count, Profile's word count.
  display: {
    fontSize: '40px', fontWeight: WEIGHT.display, lineHeight: 1.05, letterSpacing: '-0.02em',
  },
  // The screen's own title: Today, Stories, Practice.
  titleScreen: {
    fontSize: '26px', fontWeight: WEIGHT.display, lineHeight: 1.2, letterSpacing: '-0.02em',
  },
  // A section heading inside a screen.
  titleSection: {
    fontSize: '17px', fontWeight: WEIGHT.title, lineHeight: 1.3, letterSpacing: '-0.01em',
  },
  // A row or card title.
  titleCard: {
    fontSize: '15px', fontWeight: WEIGHT.title, lineHeight: 1.35,
  },
  // Prose.
  body: {
    fontSize: '15px', fontWeight: WEIGHT.body, lineHeight: 1.55,
  },
  // Supporting prose, hints, row subtitles.
  bodySecondary: {
    fontSize: '13.5px', fontWeight: WEIGHT.body, lineHeight: 1.5,
  },
  // Buttons and control labels.
  label: {
    fontSize: '13px', fontWeight: WEIGHT.label, lineHeight: 1.3,
  },
  // Metadata: levels, durations, counts-with-nouns.
  caption: {
    fontSize: '12px', fontWeight: WEIGHT.body, lineHeight: 1.4,
  },
  // The small-caps eyebrow. Unchanged from designTokens.MICRO, which already
  // worked and is used everywhere — this is the same style with a name in the
  // scale. MICRO stays exported for the call sites that have it.
  eyebrow: {
    fontSize: '10.5px', fontWeight: 800, letterSpacing: '0.14em',
    textTransform: 'uppercase', lineHeight: 1.2,
  },
}

// Numbers that sit in a column must not shift width as they change. This is a
// MODIFIER, not a role: spread it alongside a size.
//   <span style={{ ...TYPE.titleCard, ...NUMERIC }}>
export const NUMERIC = {
  fontVariantNumeric: 'tabular-nums',
  fontWeight: WEIGHT.title,
}

// ── Content type ────────────────────────────────────────────────────────────
// The font family comes from useReadingFont()/languageTheme() — never hardcoded
// here, because it is per-language (CLAUDE.md §1).
export const CONTENT_TYPE = {
  // The study card's character. studyLayout() still owns the responsive size;
  // this is the resting value it starts from.
  hanziDisplay: { fontSize: '76px', fontWeight: WEIGHT.body, lineHeight: 1.1 },
  // A story or scene line.
  hanziInline: { fontSize: '30px', fontWeight: WEIGHT.body, lineHeight: 1.5 },
  // The reading. Colour comes from pinyinInk() — it has to lift in dark mode.
  pinyin: { fontSize: '16px', fontWeight: WEIGHT.label, lineHeight: 1.3 },
  // The English meaning.
  definition: { fontSize: '15px', fontWeight: WEIGHT.body, lineHeight: 1.5 },
}

export const TYPE_ROLES = Object.keys(TYPE)
export const CONTENT_ROLES = Object.keys(CONTENT_TYPE)

// The distinct UI sizes this scale permits, as numbers — so a static check can
// assert that a new style is not inventing a 15.5px.
export const UI_SIZES = [10.5, 12, 13, 13.5, 15, 17, 26, 40]
