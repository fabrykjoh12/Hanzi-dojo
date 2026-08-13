// Single source of truth for per-language identity + theme. Adding a language is
// data-driven: add an entry here (plus its background asset, the DB CHECK-constraint
// relaxation migration, and content). See CLAUDE.md §6.
//
// Every entry exposes at least the shape the app relies on:
//   { accentHex, accentVar, font, nativeName, backgroundKey }
// plus a few extras used across screens (accentHexDark, languageName, flag,
// system, cjk, script).
//
// cjk: true  → a CJK script (hanzi / kana). Enables stroke order and the
//              CJK-only drills (Tones for Chinese, Kana for Japanese) + furigana.
// cjk: false → an alphabetic script (e.g. Russian Cyrillic): those modes are
//              gated off and an alphabet drill is offered instead.

export const LANGUAGES = {
  chinese: {
    key: 'chinese',
    system: 'hsk_3',
    languageName: 'Chinese',
    nativeName: '中文',
    flag: '🇨🇳',
    accentHex: '#B83A24',
    accentHexDark: '#922E1C',
    accentVar: 'var(--chinese-accent)',
    font: "'Noto Sans SC'",
    // webFont: the Google Fonts family spec to fetch before this language's
    // text can render properly. null = already in the base stylesheet
    // (index.html ships Chinese + the UI faces, because Chinese IS the
    // product and its hanzi are on screen at first paint). A paused track's
    // font is fetched on demand instead of being downloaded by every learner
    // who will never see it — see fontLoader.js.
    webFont: null,
    backgroundKey: 'chinese',
    cjk: true,
    script: 'hanzi',
    // BCP-47 tag for the `lang` attribute — what makes a screen reader speak
    // this text with the right voice instead of reading hanzi as English.
    langTag: 'zh-Hans',
  },
  japanese: {
    key: 'japanese',
    system: 'jlpt',
    languageName: 'Japanese',
    nativeName: '日本語',
    flag: '🇯🇵',
    accentHex: '#2E3A6E',
    accentHexDark: '#1E2750',
    accentVar: 'var(--japanese-accent)',
    font: "'Noto Sans JP'",
    webFont: 'Noto+Sans+JP:wght@300;400;500;700',
    backgroundKey: 'japanese',
    cjk: true,
    script: 'kana',
    langTag: 'ja',
  },
  russian: {
    key: 'russian',
    system: 'russian',
    languageName: 'Russian',
    nativeName: 'Русский',
    flag: '🇷🇺',
    accentHex: '#2563C9',
    accentHexDark: '#1D4EA0',
    accentVar: 'var(--russian-accent)',
    // Inter (the UI font) already ships full Cyrillic coverage, so Russian needs
    // no dedicated web font — and Inter is always loaded.
    font: 'Inter',
    webFont: null,
    backgroundKey: 'russian',
    cjk: false,
    script: 'cyrillic',
    langTag: 'ru',
  },
}

export const DEFAULT_LANGUAGE = 'chinese'

// Display order for language pickers (Onboarding, LanguageSwitcher).
export const LANGUAGE_ORDER = ['chinese', 'japanese', 'russian']

// Languages offered to everyone. The product is fully focused on Chinese; the
// other tracks (Japanese, Russian) are paused until the app has scaled, so they
// don't show up in onboarding, the landing wizard, or the switcher.
export const PUBLIC_LANGUAGES = ['chinese']

// Languages an admin account additionally sees. Japanese/Russian are paused, so
// this is Chinese-only too for now. To un-pause a track later, add its key here
// (e.g. 'japanese') — the gate + pickers pick it up automatically.
export const ADMIN_LANGUAGES = ['chinese']

// Resolve a language config, falling back to the default for unknown values.
export function languageTheme(language) {
  return LANGUAGES[language] || LANGUAGES[DEFAULT_LANGUAGE]
}

// Ordered list of language configs (for rendering pickers from data). This is
// the full set; use availableLanguages for account-facing pickers so gated
// tracks stay hidden from regular users.
export function languageList() {
  return LANGUAGE_ORDER.map(k => LANGUAGES[k])
}

// The language configs a given account may pick from. Regular accounts get the
// public set (Chinese only); admins additionally get the gated tracks. Order
// follows LANGUAGE_ORDER so every picker stays consistent.
export function availableLanguages(isAdmin) {
  const allow = new Set(isAdmin ? ADMIN_LANGUAGES : PUBLIC_LANGUAGES)
  return LANGUAGE_ORDER.filter(k => allow.has(k)).map(k => LANGUAGES[k])
}

// Whether a language uses a CJK script (drives stroke-order/furigana/CJK drills).
export function isCjk(language) {
  return languageTheme(language).cjk
}

// The BCP-47 tag for a block of TARGET-LANGUAGE text, for the `lang` attribute.
// Without it a screen reader announces hanzi with the English voice, which is
// unintelligible — so any element rendering study text (not UI chrome, not the
// English translation) should carry `lang={langAttr(language)}`.
//
// This is per-language data, never a ternary at the call site: the old
// `language === 'chinese' ? 'zh-Hans' : undefined` pattern silently gave every
// other track no tag at all (CLAUDE.md §1).
export function langAttr(language) {
  return languageTheme(language).langTag
}

// The counterpart for English text — translations, glosses and UI — sitting
// inside a subtree that has already been tagged as the target language.
// Without it, a `lang="zh-Hans"` wrapper makes the screen reader read the
// English translation with a Chinese voice too.
export const UI_LANG = 'en'

// Adaptive ink. The accent hexes above are picked to read on white paper, so on
// a dark surface they sink into the background. This mixes a color toward the
// theme's `--ink-lift` by `--ink-lift-pct` — a no-op in light mode, a lift
// toward white in dark — which keeps ONE color expression working on both
// themes without a second hardcoded palette to keep in sync.
export function ink(hex) {
  return `color-mix(in srgb, ${hex}, var(--ink-lift) var(--ink-lift-pct))`
}

// Pinyin — and any reading printed beside a character (P10-A4).
//
// This is the most-read secondary text in the product and it was being drawn in
// the RAW accent: measured 2.95:1 on `--surface` and **2.62:1** on `--surface-2`
// in dark mode, against a 4.5:1 bar. Not one of the failing sites used `ink()` —
// they all reached for `accentHex` directly, so the accent-as-ink rule was never
// the problem, its adoption was.
//
// A treatment of its own rather than plain `ink()`, for two reasons: a reading is
// content (a label can be muted; a reading has to be read), and it wants more
// lift than a mark does — `--ink-lift-pct` at 30% clears 4.5:1 on `--surface` but
// only just clears it on `--surface-2`, which is exactly where Profile's readings
// sit. 38% holds ≥5:1 on every flat surface in the app.
//
// A no-op in light mode (`--pinyin-lift-pct: 0%`), where the raw accent already
// measures 5.78:1 on white — so nothing about the light theme changes, to the
// byte.
//
// It stays well below `--text`, so the hierarchy the flashcard depends on —
// hanzi, then pinyin, then meaning — is untouched. This makes the reading
// legible, not louder.
export function pinyinInk(hex) {
  return `color-mix(in srgb, ${hex}, var(--ink-lift) var(--pinyin-lift-pct))`
}

// Small accent text that has to be read (P10-A5).
//
// `ink()` is tuned for a drawn mark — an icon, a rule, a filled glyph — where
// 30% of lift is plenty. At 11–14px the same colour lands at 2.8–3.3:1 on the
// app's dark surfaces, so every accent EYEBROW, pill and selected-option label
// failed AA.
//
// Deliberately a separate, explicitly-called helper rather than a bump to
// `--ink-lift-pct`: raising that would brighten every accent mark in the app,
// including the large ones and the filled glyphs that are correct today. Nothing
// here infers a treatment from a font size at runtime — the caller says which
// it means.
//
// Before reaching for this, ask whether the text deserves the accent at all. A
// section eyebrow usually wants `--text-muted`; the accent should mean "this one,
// here" — a selected option, an active state, an action.
export function inkStrong(hex) {
  return `color-mix(in srgb, ${hex}, var(--ink-lift) var(--ink-strong-pct))`
}

// An accent mark that has to stay SATURATED in dark mode (P14-5C).
//
// `ink` and `inkStrong` both mix toward WHITE, which is the correct move for
// legibility and the wrong one for a red: measured, #B83A24 lifted 40% toward
// white is #D5877A — salmon — and the P14-5C brief rules out exactly that
// ("avoid brown/muddy red, dusty pink"). Mixing toward the warm lift instead
// keeps the hue and adds the light: #DC6240 at 50%, which is the brand's own
// dark vermilion and still measures 5.4:1 on `--bg` and 5.05:1 on `--surface`.
//
// Use it for the accent marks a screen leads with — Home's step eyebrow, its
// secondary action, its ticks and its progress rail. Prefer `inkStrong` for
// accent text inside a dense surface, where more lift reads better, and `ink`
// for a drawn mark that carries no text.
export function inkWarm(hex) {
  return `color-mix(in srgb, ${hex}, var(--ink-warm) var(--ink-warm-pct))`
}
