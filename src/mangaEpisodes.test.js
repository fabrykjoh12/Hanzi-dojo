import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { buildVocabMatcher, matchVocabAt, matchName, boundaryAfterSkip, splitSpeaker, atomicSpans, segmentLine } from './storyReading'
import { CHARACTER_READINGS } from './characterNames'
import { buildEpisode, visibleBubbles, bubbleLayout, isEpisodeComplete, revealLimit } from './mangaLayout'

// Validates every authored manga episode in data/manga/ against the real reader:
// the same vocabulary matcher, the same segmenter, the same layout module. An
// episode that passes this is tappable and readable by construction — the two
// things a learner-facing story cannot be wrong about.
//
// The bar for a manga episode is deliberately STRICTER than for a prose season:
// prose may declare a handful of "reach" words the reference dictionary
// explains, because writing narrative without them goes flat. A manga episode
// has the artwork to carry meaning, so it has no excuse — every word must be in
// the level's list or be a curated character name.

const DIR = new URL('../data/manga/', import.meta.url)
const files = existsSync(DIR)
  ? readdirSync(DIR).filter(f => f.indexOf('.json') !== -1 && f.indexOf('.art.json') === -1)
  : []

const SNAPSHOTS = {
  'chinese|hsk_3|1': '../data/hsk1-vocab-snapshot.json',
}

function vocabMapFor(key) {
  const path = SNAPSHOTS[key]
  if (!path) return null
  const url = new URL(path, import.meta.url)
  if (!existsSync(url)) return null
  const map = {}
  let i = 0
  for (const row of JSON.parse(readFileSync(url, 'utf8'))) {
    const [word, reading] = Array.isArray(row) ? row : [row.word, row.reading]
    i += 1
    if (word && !map[word]) map[word] = { id: 'v' + i, word, reading }
  }
  return map
}

function isWordChar(c) {
  return (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A)
    || (c >= 0x3040 && c <= 0x30FF) || (c >= 0x3400 && c <= 0x9FFF)
}

const segmenter = new Intl.Segmenter('zh', { granularity: 'word' })

// Scan a line the way the reader does and return the tokens that resolve to
// nothing — the words a learner would tap and get a dictionary guess for.
function unmatchedTokens(text, matcher, names) {
  const out = []
  const particles = new Set()
  const atomic = atomicSpans(text, matcher, names, particles, segmenter)
  let i = 0
  let boundary = true
  while (i < text.length) {
    const span = atomic.get(i)
    if (span) { out.push(text.slice(i, i + span)); i += span; boundary = true; continue }
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
      if ([...t].every(ch => !isWordChar(ch.charCodeAt(0)))) continue
      out.push(t)
    }
    i = j
    boundary = b
  }
  return out
}

describe('manga episodes', () => {
  it('there is at least one authored episode', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const file of files) {
    const ep = JSON.parse(readFileSync(new URL(file, DIR), 'utf8'))
    const lines = (ep.content || '').split('\n').filter(Boolean)
    const english = (ep.english_content || '').split('\n').filter(Boolean)
    const built = buildEpisode(ep.panels, lines.length)

    describe(file + ' — ' + ep.title, () => {
      it('is a manga row with content', () => {
        expect(ep.presentation).toBe('manga')
        expect(lines.length).toBeGreaterThan(0)
      })

      it('translates line for line', () => {
        expect(english.length).toBe(lines.length)
      })

      it('keeps every line short enough for a bubble (≤ 24 chars)', () => {
        // Tighter than the 40 a prose chapter gets: this line has to fit in a
        // box drawn over a picture, on a phone.
        for (const line of lines) {
          expect(splitSpeaker(line).text.length, 'long line: ' + line).toBeLessThanOrEqual(24)
        }
      })

      it('declares every name it uses in characterNames.js', () => {
        // A name the reader's map doesn't know is not vocabulary either, so it
        // would be translated character by character in the lookup popup.
        for (const name of ep.names || []) {
          expect(CHARACTER_READINGS.chinese[name], 'undeclared name: ' + name).toBeTruthy()
        }
      })

      it('uses only speakers the episode declares in its cast', () => {
        const cast = (ep.panels && ep.panels.cast) || {}
        for (const line of lines) {
          const { speaker } = splitSpeaker(line)
          if (speaker) expect(Object.prototype.hasOwnProperty.call(cast, speaker), 'speaker not in cast: ' + speaker).toBe(true)
        }
      })

      // ── Layout ──────────────────────────────────────────────────────────
      it('every beat is drawn on exactly one panel', () => {
        const drawn = new Map()
        for (const panel of built.panels) {
          for (const b of panel.bubbles) drawn.set(b.beat, (drawn.get(b.beat) || 0) + 1)
          if (panel.choice) for (const o of panel.choice.options) drawn.set(o.beat, (drawn.get(o.beat) || 0) + 1)
        }
        const missing = []
        const twice = []
        for (let i = 0; i < lines.length; i += 1) {
          const n = drawn.get(i) || 0
          if (n === 0) missing.push(i + ': ' + lines[i])
          if (n > 1) twice.push(i + ': ' + lines[i])
        }
        expect(missing, 'beats no panel shows').toEqual([])
        expect(twice, 'beats shown more than once').toEqual([])
      })

      it('every panel with art names a real file, and every art file is used', () => {
        const base = (ep.panels && ep.panels.meta && ep.panels.meta.art_base) || ''
        const dir = new URL('../public' + base, import.meta.url)
        if (!existsSync(dir)) return   // art not fetched into this checkout yet
        const onDisk = new Set(readdirSync(dir))
        const used = new Set()
        for (const panel of built.panels) {
          if (!panel.art) continue
          used.add(panel.art)
          expect(onDisk.has(panel.art), 'missing art file: ' + panel.art).toBe(true)
        }
        for (const f of onDisk) {
          expect(used.has(f), 'orphaned art file: ' + f).toBe(true)
        }
      })

      it('gives every panel with art an alt description', () => {
        for (const panel of built.panels) {
          if (!panel.art) continue
          expect(panel.alt.length, 'no alt text on ' + panel.id).toBeGreaterThan(20)
        }
      })

      it('varies the panel shapes rather than stacking identical cards', () => {
        const withArt = built.panels.filter(p => p.art)
        const shapes = new Set(withArt.map(p => p.ratio.toFixed(3)))
        expect(shapes.size, 'every panel is the same shape').toBeGreaterThanOrEqual(3)
      })

      it('places every bubble over its art at phone widths', () => {
        // This is an overlay layout: the words belong on the picture. Dropping a
        // bubble into the gutter is the designed escape hatch for a line that
        // would otherwise cover the whole drawing — but it has to stay the
        // exception, or the episode stops being a comic and becomes a script
        // with illustrations.
        //
        // 375 and up: every bubble on the art. 320 (an iPhone SE 1) is held to a
        // lower bar on purpose — at that width a 2:1 letterbox panel genuinely
        // has no room for a two-line bubble, and a readable line under the
        // picture beats an unreadable one over it. Distorting the layout for a
        // 2016 phone would cost every other reader.
        const FLOOR = { 320: 0.6 }
        for (const width of [320, 375, 390, 430, 520]) {
          let overlaid = 0
          let totalBubbles = 0
          for (const panel of built.panels) {
            for (const b of visibleBubbles(panel, { p4: 1 })) {
              const beat = lines[b.beat]
              if (!beat) continue
              totalBubbles += 1
              const out = bubbleLayout(b, {
                columnWidth: Math.min(width - 24, 520 - 24),
                ratio: panel.ratio,
                textLength: splitSpeaker(beat).text.length,
                withReadings: true,
              })
              if (out.mode === 'overlay') overlaid += 1
            }
          }
          expect(overlaid / Math.max(1, totalBubbles), 'bubbles fall out of the art at ' + width + 'px')
            .toBeGreaterThanOrEqual(FLOOR[width] == null ? 1 : FLOOR[width])
        }
      })

      it('is completable: every gate is answerable and the last panel ends it', () => {
        const answered = {}
        for (const panel of built.panels) {
          if (panel.choice) answered[panel.id] = 0
        }
        expect(revealLimit(built.panels, answered)).toBe(built.panels.length - 1)
        expect(isEpisodeComplete(built.panels, answered, built.panels.length - 1)).toBe(true)
        // …and NOT completable by scrolling past an unanswered choice.
        if (built.panels.some(p => p.choice)) {
          expect(isEpisodeComplete(built.panels, {}, built.panels.length - 1)).toBe(false)
        }
      })

      // ── Vocabulary ──────────────────────────────────────────────────────
      const key = ep.language + '|' + ep.system + '|' + ep.level
      const vocabMap = vocabMapFor(key)
      if (!vocabMap) return

      const matcher = buildVocabMatcher(vocabMap, ep.language)
      const names = CHARACTER_READINGS[ep.language] || {}

      it('every word is in the level word list or is a curated name', () => {
        const bad = []
        for (const line of lines) {
          const { text } = splitSpeaker(line)
          for (const t of unmatchedTokens(text, matcher, names)) bad.push(t + ' (in: ' + text + ')')
        }
        expect(bad, 'words outside the level: ' + bad.join(' | ')).toEqual([])
      })

      it('declares no reach words, because it does not need any', () => {
        expect(ep.reach_words || []).toEqual([])
      })

      it('renders the tappable word the episode is built around', () => {
        // 学生 must survive segmentation as ONE token — the whole opening beat
        // of the episode is "tap this word".
        const target = lines.find(l => l.indexOf('学生') !== -1)
        expect(target, 'no line contains 学生').toBeTruthy()
        const tokens = segmentLine(splitSpeaker(target).text, matcher, names, new Set(), segmenter)
        const hit = tokens.find(t => t.text === '学生')
        expect(hit, 'segmentation split 学生').toBeTruthy()
        expect(hit.vocab).toBeTruthy()
        expect(hit.vocab.reading).toBeTruthy()
      })

      it('reads every character name as a name, not as its characters', () => {
        for (const name of ep.names || []) {
          const line = lines.find(l => splitSpeaker(l).text.indexOf(name) !== -1)
          if (!line) continue
          const tokens = segmentLine(splitSpeaker(line).text, matcher, names, new Set(), segmenter)
          const hit = tokens.find(t => t.text === name)
          expect(hit, name + ' was split into characters').toBeTruthy()
          expect(hit.name, name + ' did not get the name payload').toBeTruthy()
        }
      })
    })
  }
})
