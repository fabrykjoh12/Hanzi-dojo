import { CHARACTER_READINGS } from './characterNames'

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
// must sit within the first few characters to count as a label. Verbatim from
// the reader so counting and rendering strip labels identically.
export function splitSpeaker(line) {
  const full = line.indexOf('：')
  const ascii = line.indexOf(':')
  let idx = -1
  if (full > 0) idx = full
  if (idx < 0 && ascii > 0) idx = ascii
  if (idx > 0 && idx <= 6) {
    return { speaker: line.slice(0, idx).trim(), text: line.slice(idx + 1).trim() }
  }
  return { speaker: null, text: line }
}

// A proper name is one in the curated map that ISN'T a normal vocab word.
// Verbatim from the reader (used by both the reader's segmenter and the count).
export function matchName(text, i, vocabMap, names) {
  const maxLen = Math.min(4, text.length - i)
  for (let len = maxLen; len >= 2; len -= 1) {
    const cand = text.slice(i, i + len)
    if (names[cand] && !vocabMap[cand]) return cand
  }
  return null
}

// The names/particles a language uses — the same derivation the reader makes.
function namesFor(language) { return language === 'chinese' ? CHARACTER_READINGS.chinese : {} }
function particlesFor(language) { return language === 'japanese' ? JP_PARTICLES : NO_PARTICLES }

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

// Build a reusable matcher over a word-keyed vocab map.
//   exact  — the original keys plus any alternate spellings split out of
//            multi-form entries ("やはり; やっぱり" → both forms).
//   stems  — kanji stem → the forms that share it (Japanese only).
export function buildVocabMatcher(vocabMap = {}, language) {
  const exact = {}
  const stems = new Map()
  const isJapanese = language === 'japanese'
  for (const key in vocabMap) {
    const v = vocabMap[key]
    const forms = String(key).split(/[;；、]/).map(s => s.trim()).filter(Boolean)
    if (!forms.length) forms.push(key)
    for (const f of forms) {
      if (!exact[f]) exact[f] = v
      if (isJapanese) {
        const stem = kanjiStem(f)
        if (!stem) continue
        const list = stems.get(stem) || []
        list.push({ v, form: f })
        stems.set(stem, list)
      }
    }
  }
  return { exact, stems, isJapanese }
}

// matchVocabAt(text, i, matcher, particles) → { vocab, len } | null.
// Exact greedy longest match first; then, for Japanese, a conjugation-tolerant
// kanji-stem match (only when the char after the stem is kana, so a kanji
// compound like 見物 isn't mistaken for a conjugated 見る).
export function matchVocabAt(text, i, matcher, particles = NO_PARTICLES) {
  const isVocab = (cand) => matcher.exact[cand] && !(cand.length === 1 && particles.has(cand))
  const maxLen = Math.min(6, text.length - i)
  for (let len = maxLen; len >= 1; len -= 1) {
    const cand = text.slice(i, i + len)
    if (isVocab(cand)) return { vocab: matcher.exact[cand], len }
  }
  if (matcher.isJapanese) {
    for (let len = Math.min(6, text.length - i); len >= 1; len -= 1) {
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
      if (best) return { vocab: best.v, len }   // consume only the kanji stem
    }
  }
  return null
}

// Greedy vocab scan of one (speaker-stripped) line, mirroring the reader's
// segmentLine vocab matching without the Intl.Segmenter rendering pass. Pushes
// the matched vocab objects (in order, with duplicates) into `out`.
function scanLineVocab(text, matcher, names, particles, out) {
  let i = 0
  while (i < text.length) {
    const name = matchName(text, i, matcher.exact, names)
    if (name) { i += name.length; continue }
    const m = matchVocabAt(text, i, matcher, particles)
    if (m) { out.push(m.vocab); i += m.len; continue }
    i += 1
  }
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
  const names = namesFor(language)
  const particles = particlesFor(language)
  const matcher = buildVocabMatcher(vocabMap, language)

  const statuses = new Map()   // word → status (distinct by word)
  const counts = new Map()     // word → occurrence count (with duplicates)
  const storyWords = []
  const newWords = []

  ;(content || '').split('\n').filter(Boolean).forEach(line => {
    const { text } = splitSpeaker(line)
    const matches = []
    scanLineVocab(text, matcher, names, particles, matches)
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
