import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
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
const SNAPSHOTS = {
  'japanese|jlpt|1': new URL('../data/jlpt1-vocab-snapshot.json', import.meta.url),
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
const KNOWN_SPEAKERS = {
  japanese: new Set(['たかし', 'はな', 'おかあさん', 'おじいさん', 'せんせい', 'みせのひと', 'みんな']),
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
const jaSegmenter = new Intl.Segmenter('ja', { granularity: 'word' })
function unmatchedTokens(text, matcher, names, particles) {
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
    for (const seg of jaSegmenter.segment(text.slice(i, j))) {
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

      const vocabMap = vocabMapFor(key)
      if (!vocabMap) return   // no snapshot for this level — structural checks only
      const matcher = buildVocabMatcher(vocabMap, s.language)
      const names = CHARACTER_READINGS[s.language] || {}
      const particles = s.language === 'japanese' ? JP_PARTICLES : new Set()

      it('every kanji/katakana word resolves to vocabulary', () => {
        const bad = []
        for (const line of lines) {
          const { text } = splitSpeaker(line)
          for (const t of unmatchedTokens(text, matcher, names, particles)) {
            if (hasKanjiOrKatakana(t)) bad.push(t + ' (in: ' + text + ')')
          }
        }
        expect(bad, 'unmatched kanji/katakana: ' + bad.join(' | ')).toEqual([])
      })

      it('unexplained kana reach words stay rare (≤ 4 distinct)', () => {
        const reach = new Set()
        for (const line of lines) {
          const { text } = splitSpeaker(line)
          for (const t of unmatchedTokens(text, matcher, names, particles)) {
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
