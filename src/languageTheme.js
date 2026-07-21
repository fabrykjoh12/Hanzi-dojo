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
    backgroundKey: 'chinese',
    cjk: true,
    script: 'hanzi',
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
    backgroundKey: 'japanese',
    cjk: true,
    script: 'kana',
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
    // no dedicated web font.
    font: 'Inter',
    backgroundKey: 'russian',
    cjk: false,
    script: 'cyrillic',
  },
}

export const DEFAULT_LANGUAGE = 'chinese'

// Display order for language pickers (Onboarding, LanguageSwitcher).
export const LANGUAGE_ORDER = ['chinese', 'japanese', 'russian']

// Languages offered to everyone. The public product is Chinese-only; the other
// tracks are gated behind an account flag (see availableLanguages) so they don't
// show up in onboarding, the landing wizard, or the switcher for regular users.
export const PUBLIC_LANGUAGES = ['chinese']

// Languages an admin account additionally sees. Kept to Chinese + Japanese so
// the personal/admin experience stays focused (Russian stays hidden until it's
// wanted + seeded); widen this list to expose more tracks to admins.
export const ADMIN_LANGUAGES = ['chinese', 'japanese']

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
