// Extension required: Vite resolves an extensionless specifier, Node ESM does
// not, and this module is now imported by the story-utterance sync script as
// well as by the readers.
import { CHARACTER_READINGS, PLACE_WORDS } from './characterNames.js'
import { collectStoryNames } from './storyNames.js'

// Canonical story readability + the pure token/status helpers the immersion
// reader is built from. This is the single source of truth for "% known": the
// reader shows it, the post-study recap ranks/recommends with it, and (by
// construction) they now agree for the same user, story, cards, and language.
//
// The rules deliberately mirror what the reader VISIBLY counts and taps:
//   - speaker labels ("小明：…") are stripped — only the dialogue is counted;
//   - Chinese proper names (characterNames) are treated as names, not vocab;
//   - Japanese single-kana particles are excluded (は topic-marker vs 歯 "teeth");
//   - greedy longest-match (up to 6 chars) against the word-keyed vocab map;
//   - status buckets: known = mastered(is_easy) or review; learning = any other
//     started card; new = no card yet.
// Intl.Segmenter is intentionally NOT used here: it only sub-tokenizes the
// NON-vocab runs for rendering, which never affects the vocabulary count.

// Single-kana grammatical particles — excluded from Japanese word lookup so a
// particle isn't mistaken for a homograph noun stored in kana.
export const JP_PARTICLES = new Set(['は', 'が', 'を', 'に', 'へ', 'と', 'も', 'の', 'で', 'か', 'ね', 'よ', 'わ', 'や', 'な', 'ば'])
const NO_PARTICLES = new Set()

// A vocab card → its reading status, moved verbatim from the reader.
//   not_started — no card yet (unknown / new)
//   mastered    — card.is_easy
//   review      — reached the review state
//   learning    — started but not yet review
export function wordStatus(vocabId, userCards) {
  const card = userCards[vocabId]
  if (!card) return 'not_started'
  if (card.is_easy) return 'mastered'
  if (card.state === 'review') return 'review'
  return 'learning'
}

// Furigana display modes. Reading a book means seeing the reading only where you
// still need it; these let the learner tune how much scaffolding shows without
// re-parsing the story. Reuses the existing status buckets so "learning" /
// "unknown" mean exactly what they mean everywhere else.
export const FURIGANA_MODES = ['always', 'learning', 'unknown', 'hidden']

// Should a word at `status` show its reading in the given furigana `mode`?
// Pure so the reader can decide per-token during render (and so it's tested).
//   always   — every word with a reading
//   learning — only words you're still learning
//   unknown  — only words you haven't started (includes names, which carry no card)
//   hidden   — never
export function readingVisibleFor(mode, status) {
  if (mode === 'always') return true
  if (mode === 'hidden') return false
  if (mode === 'learning') return status === 'learning'
  if (mode === 'unknown') return status === 'not_started'
  return false
}

// Scaffold only the words you haven't started — the page reads like a book until
// the learner asks for more help. Shared by every reader so they all open the
// same way (the classic reader hardcodes this same value in its DEFAULT_PREFS).
export const DEFAULT_READING_MODE = 'unknown'

// Coerce a stored/unknown value to a real mode, so a corrupt or stale prefs
// entry can never leave a reader with no reading rule at all.
export function normalizeReadingMode(mode) {
  return FURIGANA_MODES.indexOf(mode) >= 0 ? mode : DEFAULT_READING_MODE
}

// The reading to render above one token, or null for "show nothing here". The
// whole per-word rule in one place:
//   · the mode/status decision (readingVisibleFor)
//   · a reading has to exist at all (plain text / unmatched runs carry none)
//   · Japanese kana-only words never take furigana — kana over identical kana is
//     pure noise, so ともだち stays bare while 友だち gets its reading.
// Pure, so every renderer can call it per token during render.
export function tokenReading({ text, reading, mode, status, language }) {
  if (!reading) return null
  if (!readingVisibleFor(mode, status)) return null
  if (language === 'japanese' && !hasKanjiChar(text)) return null
  return reading
}

// Split a Japanese word so the reading sits over the kanji only, trimming the
// kana that word and reading already share at each end: 食べます / たべます →
// { lead:'', core:'食', coreReading:'た', trail:'べます' }. Returns null when the
// split doesn't apply (kana-only word, no kanji core, missing reading), and the
// caller then rubies the whole token — which is what Chinese always wants.
export function furiganaSplit(word, reading) {
  const w = word || ''
  const r = reading || ''
  if (!w || !r) return null
  let wS = 0, rS = 0
  while (wS < w.length && rS < r.length && isKanaCode(w.charCodeAt(wS)) && w[wS] === r[rS]) { wS += 1; rS += 1 }
  let wE = w.length, rE = r.length
  while (wE > wS && rE > rS && isKanaCode(w.charCodeAt(wE - 1)) && w[wE - 1] === r[rE - 1]) { wE -= 1; rE -= 1 }
  const core = w.slice(wS, wE)
  const coreReading = r.slice(rS, rE)
  if (!core || !coreReading || !hasKanjiChar(core)) return null
  return { lead: w.slice(0, wS), core, coreReading, trail: w.slice(wE) }
}

// Is a card's next review within `withinMs` of `now`? Used for the "review due
// soon" hint in the lookup sheet. Returns false for missing/invalid dates so a
// card with no due_at (freshly added in the reader) simply doesn't flag.
export function isDueSoon(dueAt, now = Date.now(), withinMs = 24 * 60 * 60 * 1000) {
  if (!dueAt) return false
  const t = new Date(dueAt).getTime()
  if (!Number.isFinite(t)) return false
  return t - now <= withinMs
}

// Split "Speaker：line" into { speaker, text }. The colon (full-width or ASCII)
// must sit within the first few characters to count as a label — or, in a
// SPACED script, the prefix must be a single word (Russian labels like
// "продавец:" run past six characters, while a narrated "Она сказала: …" has a
// space in it and stays body text). The wider window is deliberately denied to
// CJK: with no spaces to bound it, a narrated "大人常常告诉他们：…" would read as
// an eight-character speaker. Verbatim from the reader so counting and
// rendering strip labels identically.
const SPEAKER_MAX = 6
const SPEAKER_WORD_MAX = 16
function isSpacedSingleWord(s) {
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i)
    if (c === 32 || c === 9 || c === 10 || c === 13 || c === 0x3000) return false   // whitespace
    if (c >= 0x3040 && c <= 0x30FF) return false                                    // kana
    if (c >= 0x3400 && c <= 0x9FFF) return false                                    // CJK
  }
  return true
}
export function splitSpeaker(line) {
  const full = line.indexOf('：')
  const ascii = line.indexOf(':')
  let idx = -1
  if (full > 0) idx = full
  if (idx < 0 && ascii > 0) idx = ascii
  if (idx > 0 && (idx <= SPEAKER_MAX || (idx <= SPEAKER_WORD_MAX && isSpacedSingleWord(line.slice(0, idx))))) {
    return { speaker: line.slice(0, idx).trim(), text: line.slice(idx + 1).trim() }
  }
  return { speaker: null, text: line }
}

// A proper name is one in the names map that ISN'T a normal vocab word.
// Membership is checked by KEY, not by value: a name derived from the story's
// own speaker labels has no reading (null), and testing truthiness would drop
// every one of them.
export function isNameKey(names, cand) {
  return Boolean(names) && Object.prototype.hasOwnProperty.call(names, cand)
}
export function matchName(text, i, vocabMap, names) {
  const maxLen = Math.min(4, text.length - i)
  for (let len = maxLen; len >= 2; len -= 1) {
    const cand = text.slice(i, i + len)
    if (isNameKey(names, cand) && !vocabMap[cand]) return cand
  }
  return null
}

// The names/particles a language uses — the same derivation the reader makes.
export function namesFor(language) { return CHARACTER_READINGS[language] || {} }

// Every name this story uses: the curated map plus the cast the story declares
// in its own speaker labels. Readers and the readability count must both call
// this (never namesFor directly) or they disagree about what is a name.
export function storyNamesFor(content, vocabMap = {}, language) {
  const speakers = []
  ;(content || '').split('\n').forEach(line => {
    const { speaker } = splitSpeaker(line)
    if (speaker) speakers.push(speaker)
  })
  return collectStoryNames(speakers, vocabMap, language, namesFor(language))
}
export function particlesFor(language) { return language === 'japanese' ? JP_PARTICLES : NO_PARTICLES }

// Per-language word segmenter, built once. `null` where Intl.Segmenter is
// missing, which simply disables atomic spans (matching falls back to the old
// pool-only behavior rather than breaking).
const SEGMENTER_LOCALE = { chinese: 'zh', japanese: 'ja', russian: 'ru' }
const SEGMENTERS = {}
export function segmenterFor(language) {
  const locale = SEGMENTER_LOCALE[language]
  if (!locale) return null
  if (!(locale in SEGMENTERS)) {
    try {
      SEGMENTERS[locale] = (typeof Intl !== 'undefined' && Intl.Segmenter)
        ? new Intl.Segmenter(locale, { granularity: 'word' }) : null
    } catch { SEGMENTERS[locale] = null }
  }
  return SEGMENTERS[locale]
}

// Is this a vocab word's dictionary form a curated place name (country/city)?
// Places stay ordinary vocabulary (own card, own status) — this only flags
// them for a distinct color, same idea as `today` highlighting a studied word.
export function isPlaceWord(word, language) {
  const set = PLACE_WORDS[language]
  return Boolean(set && word && set.has(word))
}

// ── Japanese deinflection-lite matching ──────────────────────────────────────
// Japanese story text uses conjugated surface forms (書いて, 見せました) and
// okurigana that never match the dictionary vocab key (書く, 見せる) by exact
// substring — so the reader used to drop them to a "grammar / beyond this level"
// fallback and leave them untappable. We index each kanji-bearing vocab word by
// its "kanji stem" (the word truncated after its last kanji, okurigana dropped),
// so an inflected form whose kanji stem is intact still resolves to its
// dictionary entry. Stem matches consume ONLY the kanji stem, never trailing
// kana, so a following particle can't be swallowed.

function isKanjiCode(c) { return c >= 0x3400 && c <= 0x9FFF }
function isKanaCode(c) { return c >= 0x3040 && c <= 0x30FF }

function lastKanjiIndex(word) {
  let idx = -1
  for (let i = 0; i < word.length; i += 1) if (isKanjiCode(word.charCodeAt(i))) idx = i
  return idx
}

export function hasKanjiChar(word) {
  for (let i = 0; i < (word || '').length; i += 1) if (isKanjiCode(word.charCodeAt(i))) return true
  return false
}

// The leading run of `word` up to and including its last kanji (okurigana
// stripped). '' for kana-only words — those can't be stem-matched without
// colliding with grammar/particles.
export function kanjiStem(word) {
  const w = word || ''
  const idx = lastKanjiIndex(w)
  return idx < 0 ? '' : w.slice(0, idx + 1)
}

function commonPrefixLen(a, b) {
  let n = 0
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1
  return n
}

// Vocabulary keys as stored are often decorated: set phrases keep their period
// ("すみません。"), determiners carry a placeholder ("この～"), optional particles
// ride in parentheses ("後(で)", "いっしょ(に)"). None of these ever appear
// verbatim in story text, so normalize them away and expand the variants.
export function normalizeVocabForm(form) {
  return String(form || '')
    .trim()
    .replace(/[～〜]/g, '')
    .replace(/[。．.、，,!！?？\s]+$/g, '')
}

// "後(で)" → ["後で", "後"]; plain forms pass through as [form].
export function expandParenVariants(form) {
  const m = form.match(/^(.+?)[（(](.+?)[）)]$/)
  if (m) return [m[1] + m[2], m[1]]
  return [form]
}

// ます-form → dictionary-form guesses for kana verb stems. The final い-row
// kana shifts to its う-row (かえり → かえる, つかい → つかう); ichidan verbs just
// re-attach る (たべ → たべる). Wrong guesses are harmless — they simply never
// occur in real text.
const MASU_ROW_SHIFT = {
  い: 'う', き: 'く', ぎ: 'ぐ', し: 'す', ち: 'つ', に: 'ぬ', ひ: 'ふ', び: 'ぶ', み: 'む', り: 'る',
}

// The everyday irregulars whose conjugations share no usable kana stem (する's
// stem し and いる's stem い are single kana — too short to index safely), so
// their common forms are spelled out.
const MASU_IRREGULAR = {
  します: ['する', 'した', 'して', 'しない', 'しよう', 'しましょう', 'しました', 'しません', 'しませんでした', 'しています', 'していました'],
  きます: ['くる', 'きた', 'きて', 'こない', 'きました', 'きません'],
  あります: ['ある', 'あった', 'あって', 'ありません'],
  います: ['いる', 'いた', 'いて', 'いない', 'いました', 'いません', 'いませんでした'],
}

// Common conjugation endings, longest first. After a stem match, the token
// extends across the okurigana it shares with the stored form plus one of
// these endings — so 食べました is ONE tappable token, not 食 + べました split
// into kana fragments by the fallback segmenter. Verb polite/plain/te/ta/nai
// families plus い-adjective forms, and the bare godan dictionary endings.
const CONJ_ENDINGS = [
  'ていませんでした', 'ませんでした', 'てください', 'ていました', 'ています', 'ましょう',
  'たかった', 'なかった', 'ちゃった', 'かった', 'くない', 'ました', 'ません', 'ないで',
  'ている', 'ていた', 'たい', 'ない', 'ます', 'った', 'んだ', 'んで', 'いた', 'いて',
  'いだ', 'して', 'くて', 'た', 'て', 'る', 'う', 'く', 'ぐ', 'す', 'つ', 'ぬ', 'ぶ', 'む',
]

function isHiraganaChar(ch) {
  const c = (ch || '').charCodeAt(0)
  return c >= 0x3040 && c <= 0x309F
}

// How many extra chars of `tail` beyond a matched stem belong to the same
// word: okurigana shared with the stored form, then a conjugation ending —
// optionally with one inflected kana in between (the godan row shift:
// 行かない = 行 + か + ない). The shared prefix is capped so the form's own
// final ます / dictionary kana is claimed by the endings table, not blindly
// copied (食べます vs 食べました must diverge at べ, not べま).
function conjugationExtension(tail, formTail) {
  const cap = formTail.endsWith('ます')
    ? Math.max(0, formTail.length - 2)
    : Math.max(0, formTail.length - 1)
  const maxShared = Math.min(commonPrefixLen(tail, formTail), cap)
  for (let k = maxShared; k >= 0; k -= 1) {
    const rest = tail.slice(k)
    for (const end of CONJ_ENDINGS) {
      if (rest.startsWith(end)) return k + end.length
    }
    if (isHiraganaChar(rest[0])) {
      const shifted = rest.slice(1)
      for (const end of CONJ_ENDINGS) {
        if (shifted.startsWith(end)) return k + 1 + end.length
      }
    }
  }
  return maxShared
}

// ── Russian (space-delimited, inflected) matching ────────────────────────────
// Russian text is whitespace-tokenized and heavily inflected: nouns decline for
// case/number, verbs conjugate, adjectives agree — so the dictionary form стored
// as vocab (вода, книга, читать) rarely appears verbatim. Two problems fell out
// of treating it like Chinese (greedy substring, exact-only):
//   1. one-letter function words (в, с, к, и, а, о, у, я) matched INSIDE longer
//      words — "в" lit up the в of "вода" — so a whole word highlighted as a
//      single letter.
//   2. any inflected form ("воду", "книги", "читает") missed the exact key and
//      fell to the "beyond this level" fallback, untappable.
// The fix matches WHOLE whitespace-delimited tokens only, and resolves inflected
// forms to their dictionary entry by a shared stem (common prefix + a plausible
// inflectional ending on each side). Precision guard: the token's trailing
// difference must be a real inflectional ending, so a derivation like столица
// never resolves to стол.

function isCyrillicOrLatinCode(c) {
  return (c >= 0x0400 && c <= 0x04FF)     // Cyrillic
    || (c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A)   // Latin
    || (c >= 0x30 && c <= 0x39)           // digits
}
function isRuWordChar(ch) { return isCyrillicOrLatinCode((ch || '').charCodeAt(0)) }

// Lowercase, drop combining stress accents, fold ё→е (stories spell it either
// way). The single normalization applied to both vocab forms and story tokens.
export function normalizeRussian(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/́/g, '')
    .replace(/ё/g, 'е')
    .trim()
}

// Inflectional endings that may differ between a story token and its dictionary
// form: noun case/number, adjective agreement, verb person/tense, past tense,
// infinitive/reflexive markers. Used as a precision gate — the leftover suffix
// after the shared stem must be one of these (or empty), so книг|и matches
// книг|а but столиц|а never matches стол.
const RU_INFLECTION = new Set([
  '',
  // nominal / adjectival case & agreement
  'а', 'я', 'о', 'е', 'у', 'ю', 'ы', 'и', 'ь', 'й',
  'ой', 'ей', 'ый', 'ий', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ом', 'ем',
  'ах', 'ях', 'ов', 'ев', 'ам', 'ям', 'ми', 'ью', 'ей',
  'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'ами', 'ями', 'иях', 'иям',
  // verbal — present/future personal endings, including the short forms left
  // when the theme vowel is absorbed into the shared stem (говор|и + м → "м").
  'м', 'т', 'шь', 'те',
  'ешь', 'ёшь', 'ишь', 'ет', 'ёт', 'ит', 'ем', 'им', 'ете', 'ёте',
  'ите', 'ут', 'ют', 'ат', 'ят',
  // infinitive markers (a verb's dictionary form ends in one of these)
  'ть', 'ти', 'чь', 'ать', 'ять', 'еть', 'ить', 'ыть', 'уть', 'оть',
  // past tense + reflexive
  'л', 'ла', 'ло', 'ли', 'лся', 'лась', 'лись', 'ся', 'сь', 'ться', 'тся',
])

// Longest common prefix length of two strings.
function ruLcp(a, b) {
  let n = 0
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1
  return n
}

// The prefix-index key for a normalized form: its first RU_KEY_LEN letters.
// Forms shorter than that are exact-match only (function words like в, не, это).
const RU_KEY_LEN = 3
const RU_MAX_ENDING = 4   // an inflectional ending is at most this many chars (e.g. -ться)

// Does story token `tl` inflect dictionary form `fl`? (both normalized)
// They must share a stem of at least RU_KEY_LEN, and the leftover on EACH side
// must be a short, real inflectional ending. Symmetric so it catches both a
// longer surface form (воду vs вода) and a shorter one (иду vs идут).
function ruInflects(tl, fl) {
  const lcp = ruLcp(tl, fl)
  if (lcp < RU_KEY_LEN) return false
  const tEnd = tl.slice(lcp)
  const fEnd = fl.slice(lcp)
  if (tEnd.length > RU_MAX_ENDING || fEnd.length > RU_MAX_ENDING) return false
  return RU_INFLECTION.has(tEnd) && RU_INFLECTION.has(fEnd)
}

// Build a reusable matcher over a word-keyed vocab map.
//   exact  — normalized keys, alternate spellings from multi-form entries
//            ("やはり; やっぱり"), paren variants, readings (Japanese), and
//            dictionary-form guesses for ます-form verbs.
//   stems  — kanji stems AND kana verb stems → the forms that share them
//            (Japanese only; matched only when kana follows, so a compound
//            like 見物 is never mistaken for 見る).
export function buildVocabMatcher(vocabMap = {}, language) {
  const exact = {}
  const words = {}          // original word forms only — the name-check lookup
  const stems = new Map()
  const isJapanese = language === 'japanese'
  const isRussian = language === 'russian'

  // Russian: whole-token exact map (normalized) + a first-letters prefix index
  // of forms, for the stem/inflection match.
  const ruExact = new Map()       // normalized form → vocab
  const ruPrefix = new Map()      // first RU_KEY_LEN letters → [{ v, fl }]
  const addRussian = (rawForm, v) => {
    const fl = normalizeRussian(rawForm)
    if (!fl) return
    if (!ruExact.has(fl)) ruExact.set(fl, v)
    if (fl.length >= RU_KEY_LEN) {
      const key = fl.slice(0, RU_KEY_LEN)
      const list = ruPrefix.get(key) || []
      list.push({ v, fl })
      ruPrefix.set(key, list)
    }
  }

  const addExact = (f, v) => { if (f && f.length > 1 && !exact[f]) exact[f] = v }
  // Single-char exact entries are allowed only for the original stored key
  // (real one-char vocab like 人 or 手) — derived guesses must not add them.
  const addExactAny = (f, v) => { if (f && !exact[f]) exact[f] = v }
  const addStem = (stem, form, v) => {
    if (!stem || stem.length < 1) return
    // Kana-only stems shorter than 2 chars would collide with grammar.
    if (!hasKanjiChar(stem) && stem.length < 2) return
    const list = stems.get(stem) || []
    list.push({ v, form })
    stems.set(stem, list)
  }

  const addJapaneseDerived = (f, v) => {
    const ks = kanjiStem(f)
    if (ks) addStem(ks, f, v)
    if (f.endsWith('ます') && f.length > 2) {
      for (const alt of MASU_IRREGULAR[f] || []) addExact(alt, v)
      const stem = f.slice(0, -2)                       // 食べ / かえり / つかい
      addStem(stem, f, v)
      if (!hasKanjiChar(stem)) {
        // Kana verb: index dictionary-form guesses and the shortened stem so
        // past/te forms still connect (かえり→かえ matches かえった).
        addExact(stem + 'る', v)                        // ichidan guess
        const last = stem[stem.length - 1]
        if (MASU_ROW_SHIFT[last]) addExact(stem.slice(0, -1) + MASU_ROW_SHIFT[last], v)   // godan guess
        addStem(stem.slice(0, -1), f, v)
      }
    }
  }

  for (const key in vocabMap) {
    const v = vocabMap[key]
    const rawForms = String(key).split(/[;；]/).map(s => s.trim()).filter(Boolean)
    if (!rawForms.length) rawForms.push(key)
    for (const rawForm of rawForms) {
      const norm = normalizeVocabForm(rawForm)
      if (!norm) continue
      for (const f of expandParenVariants(norm)) {
        // A single char left over from a DECORATED key ("お～" → "お") is a
        // prefix/fragment, not a standalone word — indexing it would split
        // real words (お inside おだんご). Undecorated one-char vocab is fine.
        if (f.length === 1 && norm !== rawForm) continue
        addExactAny(f, v)
        if (!words[f]) words[f] = v
        if (isJapanese) addJapaneseDerived(f, v)
        if (isRussian) addRussian(f, v)
      }
    }
    if (isJapanese && v && v.reading) {
      // Index readings too (some stories echo the kana; some vocab is kana-only
      // while its reading carries variants like "まいげつ/まいつき").
      const readings = String(v.reading).split(/[;；/／・]/).map(s => normalizeVocabForm(s)).filter(Boolean)
      for (const r of readings) {
        addExact(r, v)
        addJapaneseDerived(r, v)
      }
    }
  }
  return { exact, words, stems, isJapanese, isRussian, ruExact, ruPrefix }
}

// Match a whole Russian token at text[i]. Reads the full whitespace/punctuation
// -delimited word, then resolves it to a vocab entry by exact spelling or by
// stem/inflection. Always consumes the WHOLE token (never a single letter), and
// only starts at a word boundary — so "в" can't match inside "вода", and "воду"
// resolves to "вода". Returns { vocab, len } | null.
function matchRussianAt(text, i, matcher, atBoundary) {
  if (!atBoundary) return null
  if (!isRuWordChar(text[i])) return null
  let j = i
  while (j < text.length && isRuWordChar(text[j])) j += 1
  const token = text.slice(i, j)
  const tl = normalizeRussian(token)
  if (!tl) return null

  const exactHit = matcher.ruExact.get(tl)
  if (exactHit) return { vocab: exactHit, len: token.length }

  if (tl.length >= RU_KEY_LEN) {
    const list = matcher.ruPrefix.get(tl.slice(0, RU_KEY_LEN))
    if (list) {
      let best = null, bestLcp = -1
      for (const e of list) {
        if (!ruInflects(tl, e.fl)) continue
        const lcp = ruLcp(tl, e.fl)
        // Prefer the closest stem; tie-break the shorter dictionary form.
        if (lcp > bestLcp || (lcp === bestLcp && (!best || e.fl.length < best.fl.length))) {
          best = e; bestLcp = lcp
        }
      }
      if (best) return { vocab: best.v, len: token.length }
    }
  }
  return null
}

// ── Proper-name matching ─────────────────────────────────────────────────────
// Chinese and Japanese names are matched as a fixed substring (matchName).
// Russian names DECLINE — Иван → Ивана / Ивану / Иваном, Аня → Ани / Ане / Аню
// — so a fixed substring match either misses the form entirely or matches the
// stem and leaves the case ending dangling as its own mystery token. Russian
// names are therefore matched as whole capitalized tokens, resolved back to the
// dictionary name by the same shared-stem rule ordinary Russian vocabulary uses.

// Names arrive as a plain object; index it once per object identity.
const RU_NAME_INDEX = new WeakMap()
function ruNameIndex(names) {
  let idx = RU_NAME_INDEX.get(names)
  if (idx) return idx
  idx = []
  for (const key in names) {
    if (!Object.prototype.hasOwnProperty.call(names, key)) continue
    const nl = normalizeRussian(key)
    if (nl.length >= 2) idx.push({ word: key, nl })
  }
  RU_NAME_INDEX.set(names, idx)
  return idx
}

// Is story token `tl` an inflected form of name `nl` (both normalized)? The
// shared stem must reach within two letters of the name's end, and what's left
// on each side must be a real inflectional ending — so Ивану resolves to Иван
// while Ивановна (a different word) does not.
function nameInflects(tl, nl) {
  const lcp = ruLcp(tl, nl)
  if (lcp < 2 || lcp < nl.length - 2) return false
  const tEnd = tl.slice(lcp)
  const nEnd = nl.slice(lcp)
  if (tEnd.length > 3 || nEnd.length > 2) return false
  return RU_INFLECTION.has(tEnd) && RU_INFLECTION.has(nEnd)
}

function matchRussianNameAt(text, i, matcher, names, atBoundary) {
  if (!atBoundary) return null
  const ch = text[i]
  if (!isRuWordChar(ch)) return null
  // A Russian personal name is always capitalized; a lowercase token is an
  // ordinary word, however close its stem happens to sit to a name.
  if (ch === ch.toLowerCase()) return null
  let j = i
  while (j < text.length && isRuWordChar(text[j])) j += 1
  const token = text.slice(i, j)
  const tl = normalizeRussian(token)
  if (!tl) return null
  // Vocabulary wins, exactly as it does for Chinese/Japanese names.
  if (matcher && matcher.ruExact && matcher.ruExact.get(tl)) return null
  let best = null
  for (const e of ruNameIndex(names)) {
    if (e.nl === tl) { best = e; break }
    if (!best && nameInflects(tl, e.nl)) best = e
  }
  return best ? { text: token, word: best.word } : null
}

// matchNameAt(text, i, matcher, names, atBoundary) → { text, word } | null.
// `text` is the surface form as written (Ивану), `word` the dictionary name
// (Иван) the reading and the lookup sheet belong to. For CJK the two are equal.
export function matchNameAt(text, i, matcher, names = {}, atBoundary = true) {
  if (matcher && matcher.isRussian) return matchRussianNameAt(text, i, matcher, names, atBoundary)
  const word = matchName(text, i, (matcher && matcher.words) || {}, names)
  if (!word) return null
  // A name never wins over a LONGER vocabulary word starting in the same place:
  // the Japanese name はな sits inside はなし ("story"), and taking the name
  // there would strand し. Longest consumption wins, as it does everywhere else
  // in the matcher. (Particles are irrelevant to the comparison — a one-char
  // match can never be longer than a two-char name.)
  if (matcher) {
    const v = matchVocabAt(text, i, matcher, NO_PARTICLES, atBoundary)
    if (v && v.len > word.length) return null
  }
  return { text: word, word }
}

// The name payload a token carries — a derived name has no reading, and null
// reads the same as "no furigana here" everywhere downstream.
function namePayload(match, names) {
  return { word: match.word, reading: names[match.word] || null }
}

// matchVocabAt(text, i, matcher, particles, atBoundary) → { vocab, len } | null.
// Considers exact matches (long enough for set phrases like ありがとうございます)
// AND, for Japanese, conjugation-tolerant stem matches (only when the char
// after the stem is kana, so a kanji compound like 見物 isn't mistaken for a
// conjugated 見る) — then returns whichever interpretation CONSUMES THE MOST
// text (exact wins ties). Longest-consumption matters: in あるいて, the exact
// word ある ("exist") explains 2 chars but the stem of 歩きます explains all 4
// (あるいて = "walked") — taking the first hit instead of the longest left an
// orphaned いて that fell apart into kana fragments.
//
// `atBoundary`: hiragana-initial matches are only taken at a word boundary
// (line start, after punctuation/kanji/katakana, after a particle, or right
// after another match). Without it, かし inside たかし matched かします —
// a name became "lend". Kanji/katakana-initial matches are self-bounding.
export function matchVocabAt(text, i, matcher, particles = NO_PARTICLES, atBoundary = true) {
  // Russian is whole-token, whitespace-delimited, and inflected — a different
  // matching model from CJK substring scanning (see matchRussianAt).
  if (matcher.isRussian) return matchRussianAt(text, i, matcher, atBoundary)
  if (!atBoundary && isHiraganaChar(text[i])) return null
  const isVocab = (cand) => matcher.exact[cand] && !(cand.length === 1 && particles.has(cand))

  let exactMatch = null
  const maxLen = Math.min(12, text.length - i)
  for (let len = maxLen; len >= 1; len -= 1) {
    const cand = text.slice(i, i + len)
    if (isVocab(cand)) { exactMatch = { vocab: matcher.exact[cand], len }; break }
  }

  let stemMatch = null
  if (matcher.isJapanese) {
    for (let len = Math.min(8, text.length - i); len >= 1; len -= 1) {
      const cand = text.slice(i, i + len)
      const list = matcher.stems.get(cand)
      if (!list) continue
      const tail = text.slice(i + len)
      // Only treat this as a conjugation when okurigana (kana) follows the stem.
      if (tail.length && !isKanaCode(tail.charCodeAt(0))) continue
      // Disambiguate homographs by okurigana: prefer the form whose kana tail
      // best matches the surface text; tie-break the shorter dictionary word.
      let best = null, bestScore = -1
      for (const e of list) {
        const score = commonPrefixLen(e.form.slice(len), tail)
        if (score > bestScore || (score === bestScore && (!best || e.form.length < best.form.length))) {
          best = e; bestScore = score
        }
      }
      if (best) {
        // Extend across the conjugation so the whole inflected word is one
        // token (食べました, not 食 + kana fragments).
        const ext = conjugationExtension(tail, best.form.slice(len))
        const total = len + ext
        if (!stemMatch || total > stemMatch.len) stemMatch = { vocab: best.v, len: total }
      }
    }
  }

  if (exactMatch && stemMatch) return stemMatch.len > exactMatch.len ? stemMatch : exactMatch
  return exactMatch || stemMatch
}

// Is a token an actual word (letters/CJK/kana/Cyrillic/digits) rather than pure
// punctuation or spacing? Every word-like token is tappable in every reader,
// even the ones outside the learner's vocabulary list (conjugated verbs,
// grammar, names, words beyond the level) — you can always hear it, look it up
// and read the sentence. Punctuation stays inert.
export function isWordlikeToken(text) {
  const v = text || ''
  for (let i = 0; i < v.length; i += 1) {
    const c = v.charCodeAt(i)
    const isWord = (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A)
      || (c >= 0x3040 && c <= 0x30FF) || (c >= 0x3400 && c <= 0x9FFF)
      || (c >= 0x0400 && c <= 0x04FF) || (c >= 0xFF66 && c <= 0xFF9D)
    if (isWord) return true
  }
  return false
}

// Is `ch` a boundary-maker when skipped unmatched: punctuation/space (any
// non-word char) or a single-kana particle. A skipped ordinary word char means
// we're inside an unknown word, so the next position is NOT a boundary.
export function boundaryAfterSkip(ch, particles = NO_PARTICLES) {
  if (!ch) return true
  if (particles.has(ch)) return true
  const c = ch.charCodeAt(0)
  const isWord = (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A)
    || (c >= 0x3040 && c <= 0x30FF) || (c >= 0x3400 && c <= 0x9FFF)
    || (c >= 0x0400 && c <= 0x04FF) || (c >= 0xFF66 && c <= 0xFF9D)
  return !isWord
}

// Greedy vocab scan of one (speaker-stripped) line, mirroring the reader's
// segmentLine vocab matching without the Intl.Segmenter rendering pass. Pushes
// the matched vocab objects (in order, with duplicates) into `out`.
// ── Atomic spans (Chinese) ───────────────────────────────────────────────────
// Greedy longest-match runs left to right over the vocabulary pool, which means
// a word that merely STARTS with a pool word gets torn in half: 太阳 became
// 太 (a real pool word, "too") + a dangling 阳, and 周末 became 周 + 末. The
// learner then saw a known word that isn't there, and tapping the remainder
// asked the dictionary about a fragment instead of the word.
//
// The segmenter already knows 太阳 is one word, so it — not the pool — decides
// where words end. A segmenter word is ATOMIC when the pool cannot cover it
// completely; the scanners then emit it whole and leave it to the reference
// dictionary. When the pool CAN cover it (很多 → 很 + 多, both real entries),
// nothing changes and both stay tappable as before.
//
// Chinese only: Japanese runs conjugation/okurigana logic through the same
// matcher, where a partial match is normal and correct, and Russian is
// whitespace-tokenized already.
function isCjkWord(w) {
  for (let k = 0; k < w.length; k += 1) {
    const c = w.charCodeAt(k)
    if (!(c >= 0x3400 && c <= 0x9FFF)) return false
  }
  return true
}

// Can the pool tile [start, end) exactly? Matching is bounded to the segment:
// asking matchVocabAt would let a longer pool word overshoot the end and report
// a miss, which wrongly made 很好 (很 + 好, both pool words) look uncoverable
// just because 很好看 is also a word.
function coverableBy(text, start, end, matcher, names, particles) {
  let i = start
  while (i < end) {
    const name = matchNameAt(text, i, matcher, names, true)
    if (name && i + name.text.length <= end) { i += name.text.length; continue }
    let hit = 0
    for (let len = end - i; len >= 1; len -= 1) {
      const cand = text.slice(i, i + len)
      if (matcher.exact[cand] && !(len === 1 && particles.has(cand))) { hit = len; break }
    }
    if (!hit) return false
    i += hit
  }
  return true
}

export function atomicSpans(text, matcher, names = {}, particles = NO_PARTICLES, segmenter = null) {
  const spans = new Map()
  if (!segmenter || matcher.isRussian || matcher.isJapanese) return spans
  for (const seg of segmenter.segment(text)) {
    const w = seg.segment
    if (w.length < 2 || !isCjkWord(w)) continue
    if (matcher.exact[w]) continue                                   // already one vocab token
    const asName = matchNameAt(text, seg.index, matcher, names, true)
    if (asName && asName.text === w) continue
    // A pool word that runs PAST this segment (一点儿, where the segmenter splits
    // 一点 + 儿) means the curriculum knows this boundary better than the
    // segmenter does — leave it to the normal matcher.
    const over = matchVocabAt(text, seg.index, matcher, particles, true)
    if (over && over.len > w.length) continue
    if (coverableBy(text, seg.index, seg.index + w.length, matcher, names, particles)) continue
    spans.set(seg.index, w.length)
  }
  return spans
}

function scanLineVocab(text, matcher, names, particles, out, atomic = null) {
  let i = 0
  let boundary = true
  while (i < text.length) {
    // An atomic span contributes no vocabulary — that is the point: 太阳 is one
    // unknown word, not a known 太 plus a fragment.
    const span = atomic && atomic.get(i)
    if (span) { i += span; boundary = true; continue }
    const name = matchNameAt(text, i, matcher, names, boundary)
    if (name) { i += name.text.length; boundary = true; continue }
    const m = matchVocabAt(text, i, matcher, particles, boundary)
    if (m) { out.push(m.vocab); i += m.len; boundary = true; continue }
    boundary = boundaryAfterSkip(text[i], particles)
    i += 1
  }
}

// Segment one (speaker-stripped) line into renderable tokens: each vocab match
// is its own tappable token; a proper name is its own token too (with a `name`
// payload, so a reader can style/label it distinctly instead of showing it as
// inert filler text). Mirrors scanLineVocab's matching exactly, but keeps the
// text so the reader can render it. Pure — unit-tested.
//
// `segmenter` (Intl.Segmenter for the language) is what makes the REST of the
// line tappable. Without it, every stretch of text the vocabulary pool doesn't
// know collapses into one run token — a whole clause the learner can't tap a
// single word of. With it, unmatched text is split at real word boundaries and
// atomic spans (太阳, 周末) survive whole, so every word in the line is its own
// token whether or not it is in the pool. Optional so a caller that only wants
// vocabulary (the readability count) can skip the work.
export function segmentLine(text, matcher, names = {}, particles = NO_PARTICLES, segmenter = null) {
  const tokens = []
  const atomic = atomicSpans(text, matcher, names, particles, segmenter)
  let i = 0
  let boundary = true
  while (i < text.length) {
    const span = atomic.get(i)
    if (span) { tokens.push({ text: text.slice(i, i + span), vocab: null }); i += span; boundary = true; continue }
    const name = matchNameAt(text, i, matcher, names, boundary)
    if (name) {
      tokens.push({ text: name.text, vocab: null, name: namePayload(name, names) })
      i += name.text.length
      boundary = true
      continue
    }
    const m = matchVocabAt(text, i, matcher, particles, boundary)
    if (m) { tokens.push({ text: text.slice(i, i + m.len), vocab: m.vocab }); i += m.len; boundary = true; continue }
    // Unmatched text: run to the next thing the matcher recognises, then hand
    // the run to the segmenter so it becomes words rather than one blob.
    let j = i
    let b = boundary
    while (j < text.length) {
      if (atomic.get(j)) break
      if (matchNameAt(text, j, matcher, names, b)) break
      if (matchVocabAt(text, j, matcher, particles, b)) break
      b = boundaryAfterSkip(text[j], particles)
      j += 1
    }
    const run = text.slice(i, j)
    if (segmenter) {
      for (const seg of segmenter.segment(run)) tokens.push({ text: seg.segment, vocab: null })
    } else {
      tokens.push({ text: run, vocab: null })
    }
    i = j
    boundary = b
  }
  return tokens
}

// The distinct story words the learner studied today: the intersection of the
// story's vocabulary words with today's studied words. Order follows the story
// word list; duplicates are dropped.
export function todayWordsInStory(storyWords, todayWords) {
  const today = new Set(todayWords || [])
  const seen = new Set()
  const out = []
  ;(storyWords || []).forEach(w => {
    if (today.has(w) && !seen.has(w)) { seen.add(w); out.push(w) }
  })
  return out
}

// calculateStoryReadability({ content, vocabMap, cards, language }) — the one
// canonical readability computation. `vocabMap` is word-keyed (word → vocab
// object, as both the reader and the recap already build it); `cards` is keyed
// by vocab id. Returns everything both callers need:
//   { totalUnique, knownCount, learningCount, newCount, knownPct,
//     newWords, storyWords, statuses, counts }
//   - newWords: not-yet-started vocab objects, distinct, first-seen order
//   - storyWords: distinct vocab words present, first-seen order
//   - statuses: Map word → status (for today/session-word matching)
//   - counts: Map word → how many times it appears (with duplicates) — powers the
//     "appears N× in this story" hint without a second parse.
export function calculateStoryReadability({ content, vocabMap = {}, cards = {}, language } = {}) {
  // Derived from THIS story's speaker labels, not just the curated map — the
  // reader renders names that way, and "% known" must never count a character's
  // name as vocabulary the learner failed to know.
  const names = storyNamesFor(content, vocabMap, language)
  const particles = particlesFor(language)
  const matcher = buildVocabMatcher(vocabMap, language)

  const statuses = new Map()   // word → status (distinct by word)
  const counts = new Map()     // word → occurrence count (with duplicates)
  const storyWords = []
  const newWords = []

  // Built here rather than taken as a parameter so every caller counts the same
  // way the reader renders — a story's "% known" and its highlighted words must
  // never disagree about whether 太阳 contains the known word 太.
  const segmenter = segmenterFor(language)

  ;(content || '').split('\n').filter(Boolean).forEach(line => {
    const { text } = splitSpeaker(line)
    const matches = []
    scanLineVocab(text, matcher, names, particles, matches, atomicSpans(text, matcher, names, particles, segmenter))
    matches.forEach(v => {
      counts.set(v.word, (counts.get(v.word) || 0) + 1)
      if (statuses.has(v.word)) return
      const st = wordStatus(v.id, cards)
      statuses.set(v.word, st)
      storyWords.push(v.word)
      if (st === 'not_started') newWords.push(v)
    })
  })

  let known = 0, learning = 0, fresh = 0
  statuses.forEach(st => {
    if (st === 'review' || st === 'mastered') known += 1
    else if (st === 'learning') learning += 1
    else fresh += 1
  })
  const totalUnique = statuses.size

  return {
    totalUnique,
    knownCount: known,
    learningCount: learning,
    newCount: fresh,
    knownPct: totalUnique ? Math.round((known / totalUnique) * 100) : 0,
    newWords,
    storyWords,
    statuses,
    counts,
  }
}
