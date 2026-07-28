import { languageTheme } from './languageTheme'

// The reading font — the single source of truth for "what shape do the
// characters have" across every reader and the flashcard.
//
// For a hanzi/kanji learner the face genuinely matters: a Kai (楷体) handwriting
// face shows the stroke forms a sans face flattens away, and a Ming/Song serif
// reads like a printed book. So the font is a real, remembered setting rather
// than a hidden boolean.
//
// NO WEB FONT IS LOADED by any of these stacks. They name faces the OS may
// already ship (exactly as the old serif stacks did); anything absent falls
// through to the generic `serif` keyword, or to the language's own theme font.
//
// Adding a language is data, not a branch: give it a row in OPTIONS and a stack
// in the tables below — the same way languageTheme.js holds per-language
// identity. Never write `if (language === 'japanese')` against this.

// The shared reader prefs object. The classic reader, the paged/chat/scene
// readers and the flashcard all read the reading font out of this one record,
// so a choice made anywhere applies everywhere.
export const READER_PREFS_KEY = 'reader:prefs'

export const READING_FONT_SANS = 'sans'
export const READING_FONT_SERIF = 'serif'
export const READING_FONT_HANDWRITING = 'handwriting'

// The default is the language's own theme font — the app's existing look.
export const DEFAULT_READING_FONT = READING_FONT_SANS

// System serif faces per script. Genuinely book-like for CJK, and free.
const SERIF_STACKS = {
  chinese: "'Songti SC','SimSun','Noto Serif SC',serif",
  japanese: "'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP',serif",
  russian: "'Noto Serif','Georgia','Times New Roman',serif",
}
const FALLBACK_SERIF_STACK = "'Noto Serif','Georgia','Times New Roman',serif"

// Kai (楷体) — the brush-derived teaching face. Its strokes are the ones a
// learner is asked to write, so this is the shape worth reading hanzi in.
const HANDWRITING_STACKS = {
  chinese: "'Kaiti SC','KaiTi','STKaiti','BiauKai',serif",
}

// Which options each language actually has, in display order. A language only
// ever offers what it has a face for — no dead buttons.
const OPTIONS = {
  chinese: [READING_FONT_SANS, READING_FONT_SERIF, READING_FONT_HANDWRITING],
  japanese: [READING_FONT_SANS, READING_FONT_SERIF],
  russian: [READING_FONT_SANS, READING_FONT_SERIF],
}
const FALLBACK_OPTIONS = [READING_FONT_SANS, READING_FONT_SERIF]

const LABELS = {
  [READING_FONT_SANS]: 'Sans',
  [READING_FONT_SERIF]: 'Serif',
  [READING_FONT_HANDWRITING]: 'Handwriting',
}

// A single character shown on each option button, drawn in that option's own
// face, so the difference between the stacks is visible before the choice is
// made — the whole reason the setting exists. 永 is the character calligraphy
// uses to demonstrate stroke forms (永字八法), which is exactly what changes
// between a sans, a Ming/Song serif and a Kai face. Alphabetic scripts get no
// sample: their label already shows the difference.
const SAMPLES = {
  chinese: '永',
  japanese: '永',
}

// One line of copy under the group, explaining the option currently chosen.
const HINTS = {
  [READING_FONT_SANS]: 'Clean and even — the app’s usual face.',
  [READING_FONT_SERIF]: 'Calmer and book-like, the way print reads.',
  [READING_FONT_HANDWRITING]: 'Kai (楷体) — the handwritten stroke shapes you’d write yourself.',
}

// The CSS font-family for one option in one language. Unknown values resolve to
// the language's own font rather than throwing or rendering nothing.
export function readingFontStack(language, value) {
  const theme = languageTheme(language)
  if (value === READING_FONT_SERIF) return SERIF_STACKS[theme.key] || FALLBACK_SERIF_STACK
  if (value === READING_FONT_HANDWRITING) {
    const stack = HANDWRITING_STACKS[theme.key]
    if (stack) return stack
  }
  return theme.font
}

// The options a language offers, ready to render: value, label, sample, and the
// stack the label + sample are drawn in, so the choice is visible before it's
// made. `sample` is '' for languages that don't need one.
export function readingFontOptions(language) {
  const theme = languageTheme(language)
  const values = OPTIONS[theme.key] || FALLBACK_OPTIONS
  return values.map(value => ({
    value,
    label: LABELS[value],
    sample: SAMPLES[theme.key] || '',
    stack: readingFontStack(theme.key, value),
  }))
}

// Coerce a stored/unknown value to an option this language actually offers, so
// a stale pref (or a language switch away from Chinese with Kai chosen) can
// never leave a reader on a face that doesn't exist here.
export function normalizeReadingFont(language, value) {
  const theme = languageTheme(language)
  const values = OPTIONS[theme.key] || FALLBACK_OPTIONS
  return values.indexOf(value) >= 0 ? value : DEFAULT_READING_FONT
}

// The one-line hint shown beneath the group for the chosen option.
export function readingFontHint(language, value) {
  return HINTS[normalizeReadingFont(language, value)] || ''
}

// Read the choice out of the shared reader prefs object.
//
// Migration: before this setting existed the only control was a `serif` boolean.
// Anyone who had turned it on must land on Serif, not be quietly reset to Sans —
// so the legacy flag is honoured whenever no explicit choice has been stored.
export function readingFontFromPrefs(prefs, language) {
  const saved = (prefs && typeof prefs === 'object') ? prefs : {}
  if (typeof saved.readingFont === 'string') return normalizeReadingFont(language, saved.readingFont)
  if (saved.serif === true) return normalizeReadingFont(language, READING_FONT_SERIF)
  return DEFAULT_READING_FONT
}

// What to merge into the prefs object when the learner picks a font. The legacy
// `serif` flag is kept in step so an older build (or a rollback) still shows the
// reader the face they asked for.
export function readingFontPatch(language, value) {
  const next = normalizeReadingFont(language, value)
  return { readingFont: next, serif: next === READING_FONT_SERIF }
}
