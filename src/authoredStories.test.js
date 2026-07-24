import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { buildVocabMatcher, matchVocabAt, boundaryAfterSkip, splitSpeaker, matchName, JP_PARTICLES } from './storyReading'
import { splitScene } from './sceneReading'
import { glossaryLookup } from './grammarGlossary'
import { CHARACTER_READINGS } from './characterNames'

// Validates data/authored-stories.json against the REAL reader matcher and the
// level's vocabulary snapshot, so an authored story is tappable by
// construction: every kanji/katakana word must resolve to vocabulary (or a
// character name), and unexplained kana "reach words" stay rare. This is the
// same bar the serial pipeline enforces, applied with the production matcher.

const stories = JSON.parse(readFileSync(new URL('../data/authored-stories.json', import.meta.url), 'utf8'))

// Vocabulary snapshots, keyed `language|system|level`. A snapshot is a JSON
// array of [word, reading] pairs — exactly the shape buildVocabMatcher expects
// once expanded into a vocab map (see vocabMapFor). Produce one by dispatching
// the matching `authored-vocab-*` task in .github/workflows/regen-content.yml
// and reducing the dumped rows to [word, reading] pairs.
//
// ⚠️ For a level ABOVE 1, concatenate the dumps for levels 1…N — a snapshot must
// be CUMULATIVE. Each `authored-vocab-*` task dumps its own level alone, which
// is right for level 1 (where cumulative == the level) but wrong above it: the
// reader loads vocabulary for every level (`Stories.jsx` fetches `vocabulary`
// with no level filter, "so every word in a story is clickable") and the public
// story page caps at `v.level <= s.level` (the `public_story` RPC). A level-N
// story can therefore legitimately use 我/是/很, and a level-N-only snapshot
// would fail it for words the reader can tap perfectly well. Capping at N
// rather than dumping every level keeps the bar honest: it matches what the
// public page guarantees, which is the stricter of the two surfaces.
//
// Entries are OPTIONAL BY EXISTENCE: a level listed here with no committed
// snapshot file simply falls back to the structural-only checks below, so the
// suite stays green before the owner has run the dump. Never make an absent
// snapshot a failure.
const SNAPSHOT_FILES = {
  'japanese|jlpt|1': '../data/jlpt1-vocab-snapshot.json',
  'chinese|hsk_3|3': '../data/hsk3-vocab-snapshot.json',
}
const SNAPSHOTS = {}
for (const key of Object.keys(SNAPSHOT_FILES)) {
  const url = new URL(SNAPSHOT_FILES[key], import.meta.url)
  if (existsSync(url)) SNAPSHOTS[key] = url
}

function vocabMapFor(key) {
  const url = SNAPSHOTS[key]
  if (!url) return null
  const pairs = JSON.parse(readFileSync(url, 'utf8'))
  const map = {}
  pairs.forEach(([word, reading], i) => { if (!map[word]) map[word] = { id: 'v' + i, word, reading } })
  return map
}

// Character bibles for the recurring authored serials, keyed by language. The
// known-speaker check is a typo guard for a *fixed* cast (the Japanese serial's
// characters plus the chorus label みんな, "everyone", for group lines). Lanes
// with an open-ended cast — e.g. the chat-story library — have no bible and are
// exempt from the check.
//
// ⚠️ Chinese lane: a personal name used as a speaker (or anywhere in the story
// text) MUST also exist in `src/characterNames.js` → CHARACTER_READINGS.chinese.
// The reader detects names via `matchName` against that map; a name that is not
// listed is not vocabulary either, so the reader would translate it
// character-by-character instead of showing the "Name" popup. Hence the Chinese
// bible is DERIVED from CHARACTER_READINGS — adding a new character to an
// authored Chinese season means adding it to characterNames.js first.
// Role nouns (妈妈/朋友/老师/服务员…) are ordinary vocabulary, deliberately
// absent from CHARACTER_READINGS, and allow-listed separately as speaker
// labels. Extend this list (not CHARACTER_READINGS) when a new season needs a
// role-noun speaker; extend CHARACTER_READINGS when it needs a real name.
const CN_ROLE_SPEAKERS = ['妈妈', '爸爸', '朋友', '老师', '服务员', '店员', '医生', '大家']
const KNOWN_SPEAKERS = {
  japanese: new Set(['たかし', 'はな', 'おかあさん', 'おじいさん', 'せんせい', 'みせのひと', 'みんな']),
  chinese: new Set([...Object.keys(CHARACTER_READINGS.chinese || {}), ...CN_ROLE_SPEAKERS]),
}

function hasKanjiOrKatakana(s) {
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i)
    if ((c >= 0x3400 && c <= 0x9FFF) || (c >= 0x30A0 && c <= 0x30FF)) return true
  }
  return false
}
function isWordChar(c) {
  return (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A)
    || (c >= 0x3040 && c <= 0x30FF) || (c >= 0x3400 && c <= 0x9FFF)
}

// Scan a line the way the reader does (same match calls, same run handling,
// same Intl.Segmenter pass over unmatched runs) and return the resulting
// plain word tokens — the ones that would tap without a vocabulary entry.
// The reader picks its Intl.Segmenter locale from the track language, so the
// validator must too — 'zh' for Chinese, 'ja' for Japanese.
const SEGMENTER_LOCALE = { japanese: 'ja', chinese: 'zh', russian: 'ru' }
const segmenters = {}
function segmenterFor(language) {
  const locale = SEGMENTER_LOCALE[language] || 'ja'
  if (!segmenters[locale]) segmenters[locale] = new Intl.Segmenter(locale, { granularity: 'word' })
  return segmenters[locale]
}
function unmatchedTokens(text, matcher, names, particles, segmenter) {
  const out = []
  let i = 0
  let boundary = true
  while (i < text.length) {
    const name = matchName(text, i, matcher.words, names)
    if (name) { i += name.length; boundary = true; continue }
    const m = matchVocabAt(text, i, matcher, particles, boundary)
    if (m) { i += m.len; boundary = true; continue }
    let j = i
    let b = boundary
    while (j < text.length) {
      if (matchName(text, j, matcher.words, names)) break
      if (matchVocabAt(text, j, matcher, particles, b)) break
      b = boundaryAfterSkip(text[j], particles)
      j += 1
    }
    for (const seg of segmenter.segment(text.slice(i, j))) {
      const t = seg.segment
      if (!t.trim()) continue
      if ([...t].every(ch => !isWordChar(ch.charCodeAt(0)))) continue   // punctuation
      if (t.length === 1 && particles.has(t)) continue                  // particle
      out.push(t)
    }
    i = j
    boundary = b
  }
  return out
}

describe('authored stories validate against the level vocabulary', () => {
  for (const s of stories) {
    const key = s.language + '|' + s.system + '|' + s.level
    describe(s.title, () => {
      const lines = s.content.split('\n').filter(Boolean)
      const english = (s.english_content || '').split('\n').filter(Boolean)

      it('English translation, when present, is line-parallel', () => {
        // Chat-format stories are summary-only (the chat reader has no in-reader
        // English toggle), so they carry no english_content — exempt them, but
        // any story that *does* translate must stay line-for-line parallel.
        if (!s.english_content) return
        expect(english.length).toBe(lines.length)
      })

      it('uses only known speakers', () => {
        const bible = KNOWN_SPEAKERS[s.language]
        if (!bible) return   // no fixed cast for this language's lane
        for (const line of lines) {
          const { speaker } = splitSpeaker(line)
          if (speaker) expect(bible.has(speaker), 'unknown speaker: ' + speaker).toBe(true)
        }
      })

      it('keeps lines readable (≤ 40 chars)', () => {
        for (const line of lines) {
          const body = s.presentation === 'scene' ? splitScene(line).text : line
          expect(splitSpeaker(body).text.length, 'long line: ' + line).toBeLessThanOrEqual(40)
        }
      })

      it('scene stories carry a leading emoji on most lines', () => {
        if (s.presentation !== 'scene') return
        const withEmoji = lines.filter(l => splitScene(l).emoji).length
        expect(withEmoji / lines.length, 'scene lines missing a leading emoji').toBeGreaterThanOrEqual(0.8)
      })

      it('interactions reference valid you-spoken beats', () => {
        if (!s.interactions) return
        const you = s.interactions.you
        expect(typeof you, 'interactions.you must be a speaker name').toBe('string')
        for (const idx of Object.keys(s.interactions.distractors || {})) {
          expect(Number(idx), 'distractor beat ' + idx + ' cannot be beat 0 (never gates)').toBeGreaterThanOrEqual(1)
          const line = lines[Number(idx)]
          expect(line, 'distractor beat ' + idx + ' out of range').toBeTruthy()
          expect(splitSpeaker(line).speaker, 'distractor beat ' + idx + ' is not spoken by ' + you).toBe(you)
        }
      })

      const vocabMap = vocabMapFor(key)
      if (!vocabMap) return   // no snapshot for this level — structural checks only
      const matcher = buildVocabMatcher(vocabMap, s.language)
      const names = CHARACTER_READINGS[s.language] || {}
      const particles = s.language === 'japanese' ? JP_PARTICLES : new Set()
      const segmenter = segmenterFor(s.language)

      // For Chinese this is the whole bar: every hanzi run must resolve to a
      // vocabulary entry or a CHARACTER_READINGS name, or it is untappable.
      it('every kanji/katakana word resolves to vocabulary', () => {
        const bad = []
        for (const line of lines) {
          const { text } = splitSpeaker(line)
          for (const t of unmatchedTokens(text, matcher, names, particles, segmenter)) {
            if (hasKanjiOrKatakana(t)) bad.push(t + ' (in: ' + text + ')')
          }
        }
        expect(bad, 'unmatched kanji/katakana: ' + bad.join(' | ')).toEqual([])
      })

      // Japanese: kana grammar/reach words. Chinese has no kana, so this only
      // catches stray latin/digit runs — harmless, and a useful typo guard.
      it('unexplained reach words stay rare (≤ 4 distinct)', () => {
        const reach = new Set()
        for (const line of lines) {
          const { text } = splitSpeaker(line)
          for (const t of unmatchedTokens(text, matcher, names, particles, segmenter)) {
            if (hasKanjiOrKatakana(t)) continue
            if (glossaryLookup(s.language, t)) continue   // grammar tap works
            reach.add(t)
          }
        }
        expect([...reach].length, 'reach words: ' + [...reach].join('、')).toBeLessThanOrEqual(4)
      })
    })
  }
})
