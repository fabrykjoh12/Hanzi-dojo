// Story validation — the "code, not vibes" gate that decides whether a story
// chapter is really readable at its level.
//
// This lived inside generate-serial-stories.mjs, where only the LLM pipeline
// could reach it. It matters for hand-authored stories just as much: a chapter
// written by a person (or by an assistant in a chat session, with no API key in
// sight) has exactly the same failure modes — a word the learner has not met,
// a speaker who is not in the cast, a line so long it reads as a paragraph.
//
// It is also the contract with the reader. The matcher here mirrors
// src/storyReading.js, so "passes validation" means "every word is tappable in
// the app" — a story that validates cannot contain dead text.
//
// Pure: no Supabase, no network, no LLM. Give it lines and a dictionary.

export const DEFAULT_COLON = '：'

const PUNCT = new Set('，。！？：；、“”‘’…—·《》〈〉（）「」『』・,.!?:;"\'()[]{}<>~～-–—%＄$&*/\\ \t\r　0123456789０１２３４５６７８９'.split(''))

// Emoji are not vocabulary. `scene` stories lead each line with one on purpose,
// and counting them as unmatched characters dropped a perfectly good HSK 2
// story to 49% coverage — the validator marking the illustration wrong.
function isEmoji(ch) {
  const c = ch.codePointAt(0)
  return (c >= 0x1F000 && c <= 0x1FAFF)      // pictographs, faces, symbols
    || (c >= 0x2600 && c <= 0x27BF)          // misc symbols and dingbats
    || (c >= 0x2190 && c <= 0x21FF)          // arrows
    || c === 0x200D                          // zero-width joiner
    || (c >= 0xFE00 && c <= 0xFE0F)          // variation selectors
    || (c >= 0xD800 && c <= 0xDFFF)          // surrogate halves of the above
}

export function isPunct(ch) {
  return PUNCT.has(ch) || (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || isEmoji(ch)
}

export function isHiragana(ch) {
  const c = ch.charCodeAt(0)
  return c >= 0x3040 && c <= 0x309F
}

// "李明：吃饭吧" → { speaker: '李明', text: '吃饭吧' }. Mirrors the reader's
// splitSpeaker (src/storyReading.js) EXACTLY — same caps, same spaced-word
// window — because this validator's promise is "validates ⇒ renders the same
// way". It used to cap at 8, which was stricter than the reader's 6 for CJK:
// a narrated "最后她说了一句：…" (7 chars) validated as a speaker tag here while
// rendering as ordinary narration in the app, so the checker flagged phantom
// bugs in lines the reader handled fine.
const SPEAKER_MAX = 6         // CJK names are short; anything longer is narration
const SPEAKER_WORD_MAX = 16   // one spaced-language word (Иван, бабушка) may be longer
function isSpacedSingleWord(s) {
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i)
    if (c === 32 || c === 9 || c === 10 || c === 13 || c === 0x3000) return false   // whitespace
    if (c >= 0x3040 && c <= 0x30FF) return false                                    // kana
    if (c >= 0x3400 && c <= 0x9FFF) return false                                    // CJK
  }
  return true
}
export function splitSpeaker(line, colon = DEFAULT_COLON) {
  const idx = line.indexOf(colon)
  if (idx > 0 && (idx <= SPEAKER_MAX || (idx <= SPEAKER_WORD_MAX && isSpacedSingleWord(line.slice(0, idx))))) {
    return { speaker: line.slice(0, idx).trim(), text: line.slice(idx + 1).trim() }
  }
  return { speaker: null, text: line }
}

// Stored vocabulary carries decorations story text never has ("この～",
// "すみません。", "後(で)"). Normalizing them — and, for Japanese, also indexing
// kanji stems and ます-stems — is what lets a naturally conjugated pool verb
// (食べます → 食べた) count as in-pool instead of as a miss.
export function buildDict(pool, { language = 'chinese', speakers = [], extraNames = [] } = {}) {
  const dict = new Set()
  const norm = (s) => String(s || '').trim().replace(/[～〜]/g, '').replace(/[。．.、，,!！?？\s]+$/g, '')
  const addForms = (raw) => {
    const f = norm(raw)
    if (!f) return
    const pm = f.match(/^(.+?)[（(](.+?)[）)]$/)
    const variants = pm ? [pm[1] + pm[2], pm[1]] : [f]
    for (const w of variants) {
      dict.add(w)
      if (language !== 'japanese') continue
      let lastK = -1
      for (let i = 0; i < w.length; i += 1) {
        const c = w.charCodeAt(i)
        if (c >= 0x3400 && c <= 0x9FFF) lastK = i
      }
      if (lastK >= 0) dict.add(w.slice(0, lastK + 1))
      if (w.endsWith('ます') && w.length > 4) dict.add(w.slice(0, -2))
    }
  }
  for (const v of pool) {
    const word = typeof v === 'string' ? v : v.word
    addForms(word)
    if (language === 'japanese' && v && v.reading) {
      String(v.reading).split(/[/／・;；]/).forEach(addForms)
    }
  }
  speakers.forEach(n => dict.add(n))
  extraNames.forEach(n => dict.add(n))
  return dict
}

// CJK coverage: greedy longest-match against the allowed dictionary. Unmatched
// hiragana is allowed for Japanese (particles and conjugation ARE the grammar
// the level permits); everything else unmatched counts against coverage.
export function cjkCoverage(lines, dict, maxWordLen = 8, allowHiragana = false, colon = DEFAULT_COLON) {
  let matched = 0, unmatched = 0
  const misses = new Map()
  for (const raw of lines) {
    const text = splitSpeaker(raw, colon).text
    let i = 0
    while (i < text.length) {
      const ch = text[i]
      if (isPunct(ch)) { i += 1; continue }
      let hit = 0
      for (let len = Math.min(maxWordLen, text.length - i); len >= 1; len -= 1) {
        if (dict.has(text.slice(i, i + len))) { hit = len; break }
      }
      if (hit > 0) { matched += hit; i += hit; continue }
      if (allowHiragana && isHiragana(ch)) { matched += 1; i += 1; continue }
      // Collect the whole unmatched run, so callers see words rather than chars.
      let j = i
      while (j < text.length && !isPunct(text[j]) && !(allowHiragana && isHiragana(text[j]))) {
        let anyHit = false
        for (let len = Math.min(maxWordLen, text.length - j); len >= 1; len -= 1) {
          if (dict.has(text.slice(j, j + len))) { anyHit = true; break }
        }
        if (anyHit) break
        j += 1
      }
      const run = text.slice(i, j)
      misses.set(run, (misses.get(run) || 0) + 1)
      unmatched += run.length
      i = j
    }
  }
  const total = matched + unmatched
  return { coverage: total === 0 ? 1 : matched / total, misses: [...misses.keys()] }
}

// Russian: token-level, with a prefix allowance for inflection. An A1 validator
// doesn't need a morphological analyzer — sharing the first 4+ letters with a
// pool word is close enough to catch real out-of-pool vocabulary.
const RU_FUNCTION = new Set(['и', 'а', 'но', 'в', 'во', 'не', 'на', 'у', 'с', 'со', 'к', 'ко', 'по', 'за', 'из', 'о', 'об', 'от', 'до', 'же', 'бы', 'ли', 'да', 'нет', 'то', 'уже', 'ещё', 'еще', 'вот', 'как', 'что', 'кто', 'это', 'этот', 'эта', 'эти', 'тот', 'та', 'те', 'мой', 'моя', 'мои', 'твой', 'наш', 'ваш', 'его', 'её', 'ее', 'их', 'я', 'ты', 'он', 'она', 'оно', 'мы', 'вы', 'они', 'меня', 'тебя', 'него', 'нее', 'неё', 'нас', 'вас', 'них', 'мне', 'тебе', 'ему', 'ей', 'нам', 'вам', 'им', 'есть', 'был', 'была', 'было', 'были', 'будет', 'будут', 'очень', 'там', 'тут', 'здесь', 'потом', 'тоже'])

export function russianCoverage(lines, poolWords, names, colon = DEFAULT_COLON) {
  const pool = poolWords.map(w => w.toLowerCase())
  const nameSet = new Set(names.map(n => n.toLowerCase()))
  let matched = 0, unmatched = 0
  const misses = new Set()
  for (const raw of lines) {
    const text = splitSpeaker(raw, colon).text.toLowerCase()
    const tokens = text.split(/[^а-яё]+/).filter(Boolean)
    for (const t of tokens) {
      const ok = RU_FUNCTION.has(t) || nameSet.has(t)
        || pool.some(w => w === t || (t.length >= 4 && w.length >= 4 && w.slice(0, 4) === t.slice(0, 4)))
      if (ok) matched += 1
      else { unmatched += 1; misses.add(t) }
    }
  }
  const total = matched + unmatched
  return { coverage: total === 0 ? 1 : matched / total, misses: [...misses] }
}

// The whole gate. `tier` supplies the level's targets (line range, minimum
// coverage, how many distinct reach words are tolerable); everything else
// describes the story's world.
export function validateStory(content, {
  pool,
  dict,
  tier,
  language = 'chinese',
  speakers = [],
  extraNames = [],
  maxLineChars = 36,
  colon = DEFAULT_COLON,
} = {}) {
  const problems = []
  const lines = (content || '').split('\n').map(l => l.trim()).filter(Boolean)

  const [minL, maxL] = tier.lines
  if (lines.length < minL - 2) problems.push('Too short: ' + lines.length + ' lines (need at least ' + minL + ').')
  if (lines.length > maxL + 8) problems.push('Too long: ' + lines.length + ' lines (target at most ' + maxL + ').')

  const badSpeakers = new Set()
  for (const line of lines) {
    const { speaker } = splitSpeaker(line, colon)
    if (speaker && speakers.indexOf(speaker) === -1) badSpeakers.add(speaker)
  }
  if (badSpeakers.size > 0) {
    problems.push('Unknown dialogue speakers: ' + [...badSpeakers].join(', ') + '. Allowed: ' + speakers.join(', '))
  }

  const longLines = lines.filter(l => splitSpeaker(l, colon).text.length > maxLineChars * 2)
  if (longLines.length > 0) {
    problems.push(longLines.length + ' line(s) are far too long — split them into shorter sentences.')
  }

  let cov
  if (language === 'russian') {
    cov = russianCoverage(lines, pool.map(v => (typeof v === 'string' ? v : v.word)), speakers, colon)
  } else {
    const d = dict || buildDict(pool, { language, speakers, extraNames })
    cov = cjkCoverage(lines, d, 8, language === 'japanese', colon)
  }

  const minCov = tier.minCov != null ? tier.minCov : 0.9
  const maxMisses = tier.maxMisses != null ? tier.maxMisses : 8
  if (cov.coverage < minCov) {
    problems.push('Vocabulary coverage ' + Math.round(cov.coverage * 100) + '% (need ' + Math.round(minCov * 100) + '%). Out-of-pool: ' + cov.misses.slice(0, 25).join('、'))
  } else if (cov.misses.length > maxMisses) {
    problems.push(cov.misses.length + ' distinct out-of-pool words (max ' + maxMisses + '). Replace the less important ones: ' + cov.misses.slice(0, 25).join('、'))
  }

  return { ok: problems.length === 0, problems, coverage: cov.coverage, misses: cov.misses, lineCount: lines.length }
}
