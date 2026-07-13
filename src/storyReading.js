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

// Greedy vocab scan of one (speaker-stripped) line, mirroring the reader's
// segmentLine vocab matching without the Intl.Segmenter rendering pass. Pushes
// the matched vocab objects (in order, with duplicates) into `out`.
function scanLineVocab(text, vocabMap, names, particles, out) {
  const isVocab = (cand) => vocabMap[cand] && !(cand.length === 1 && particles.has(cand))
  let i = 0
  while (i < text.length) {
    const name = matchName(text, i, vocabMap, names)
    if (name) { i += name.length; continue }
    let matched = null
    const maxLen = Math.min(6, text.length - i)
    for (let len = maxLen; len >= 1; len -= 1) {
      const cand = text.slice(i, i + len)
      if (isVocab(cand)) { matched = cand; break }
    }
    if (matched) { out.push(vocabMap[matched]); i += matched.length; continue }
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
//     newWords, storyWords, statuses }
//   - newWords: not-yet-started vocab objects, distinct, first-seen order
//   - storyWords: distinct vocab words present, first-seen order
//   - statuses: Map word → status (for today/session-word matching)
export function calculateStoryReadability({ content, vocabMap = {}, cards = {}, language } = {}) {
  const names = namesFor(language)
  const particles = particlesFor(language)

  const statuses = new Map()   // word → status (distinct by word)
  const storyWords = []
  const newWords = []

  ;(content || '').split('\n').filter(Boolean).forEach(line => {
    const { text } = splitSpeaker(line)
    const matches = []
    scanLineVocab(text, vocabMap, names, particles, matches)
    matches.forEach(v => {
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
  }
}
