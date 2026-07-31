import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { buildVocabMatcher, matchVocabAt, matchName, boundaryAfterSkip, splitSpeaker, atomicSpans, segmentLine } from './storyReading'
import { CHARACTER_READINGS } from './characterNames'
import { buildEpisode, visibleBubbles, bubbleLayout, isEpisodeComplete, revealLimit } from './manhuaLayout'

// Validates every authored manhua episode in data/manhua/ against the real reader:
// the same vocabulary matcher, the same segmenter, the same layout module. An
// episode that passes this is tappable and readable by construction — the two
// things a learner-facing story cannot be wrong about.
//
// The bar for a manhua episode is deliberately STRICTER than for a prose season:
// prose may declare a handful of "reach" words the reference dictionary
// explains, because writing narrative without them goes flat. A manhua episode
// has the artwork to carry meaning, so it has no excuse — every word must be in
// the level's list or be a curated character name.

const DIR = new URL('../data/manhua/', import.meta.url)
const files = existsSync(DIR)
  ? readdirSync(DIR).filter(f => f.indexOf('.json') !== -1 && f.indexOf('.art.json') === -1)
  : []

// A level's pool is the union of the files listed for it, because a level whose
// own list is not cumulative needs the levels below it. Same convention, and the
// same files, as src/authoredStories.test.js and check-authored-stories.mjs.
//
// ⚠️ HSK 3 is NOT data/hsk3-vocab-snapshot.json, however much it looks like the
// next rung of the hsk1/hsk2 ladder. That file is HSK 1+2 plus 457 words from an
// OLDER HSK 3 draft, of which only 50 survive in the current level. Both other
// checkers carry this warning already, and this one still got it wrong when
// HSK 3 was registered: it would have rejected 发现, 声音, 如果, 才, 又, 一样,
// 以前, 地方, 安静 and 照片 — ordinary words an HSK 3 learner has had since
// 2026-07-28 — and forced a manhua episode to declare curriculum vocabulary as
// reach words, which the format forbids outright. data/hsk3.json matches the
// database exactly; the HSK 1+2 snapshot supplies the levels below it.
const SNAPSHOTS = {
  'chinese|hsk_3|1': ['../data/hsk1-vocab-snapshot.json'],
  'chinese|hsk_3|2': ['../data/hsk2-vocab-snapshot.json'],
  'chinese|hsk_3|3': ['../data/hsk2-vocab-snapshot.json', '../data/hsk3.json'],
}

// Answer every gate in an episode with the option at `pick`, clamped to what
// each gate actually offers. Layout is checked along more than one path because
// a branch-only bubble is invisible on the other branch — measuring only the
// first option would leave every "when" bubble in the episode unmeasured.
function answerAll(panels, pick) {
  const out = {}
  for (const panel of panels) {
    if (panel.choice) out[panel.id] = Math.min(pick, panel.choice.options.length - 1)
  }
  return out
}

// Two shapes are accepted: the [[word, reading]] snapshots and the
// [{word, reading, meaning}] seed lists that seed-vocab.mjs loads.
//
// All-or-nothing on the union: half a pool is worse than none, because the
// missing half surfaces as "words outside the level" on perfectly valid writing
// and sends whoever is authoring off to rewrite good lines.
function vocabMapFor(key) {
  const paths = SNAPSHOTS[key]
  if (!paths) return null
  const urls = paths.map(p => new URL(p, import.meta.url))
  if (!urls.every(u => existsSync(u))) return null
  const map = {}
  let i = 0
  for (const url of urls) {
    for (const row of JSON.parse(readFileSync(url, 'utf8'))) {
      const [word, reading] = Array.isArray(row) ? row : [row.word, row.reading]
      i += 1
      if (word && !map[word]) map[word] = { id: 'v' + i, word, reading }
    }
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

describe('manhua episodes', () => {
  it('there is at least one authored episode', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const file of files) {
    const ep = JSON.parse(readFileSync(new URL(file, DIR), 'utf8'))
    const lines = (ep.content || '').split('\n').filter(Boolean)
    const english = (ep.english_content || '').split('\n').filter(Boolean)
    const built = buildEpisode(ep.panels, lines.length)

    describe(file + ' — ' + ep.title, () => {
      it('is a manhua row with content', () => {
        expect(ep.presentation).toBe('manhua')
        expect(lines.length).toBeGreaterThan(0)
      })

      it('translates line for line', () => {
        expect(english.length).toBe(lines.length)
      })

      it('keeps authored comprehension questions publishable', () => {
        if (!Object.prototype.hasOwnProperty.call(ep, 'questions')) return
        expect(Array.isArray(ep.questions)).toBe(true)
        expect(ep.questions.length).toBeGreaterThan(0)
        for (const question of ep.questions) {
          expect(typeof question.question).toBe('string')
          expect(question.question.trim().length).toBeGreaterThan(0)
          expect(Array.isArray(question.options)).toBe(true)
          expect(question.options).toHaveLength(4)
          expect(question.options.every(option => typeof option === 'string' && option.trim().length > 0)).toBe(true)
          expect(Number.isInteger(question.correct_index)).toBe(true)
          expect(question.correct_index).toBeGreaterThanOrEqual(0)
          expect(question.correct_index).toBeLessThan(question.options.length)
        }
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
        const declared = built.panels.filter(p => p.art)
        const dir = new URL('../public' + base, import.meta.url)
        // An episode that names art must HAVE that art — panel files are
        // committed, so a missing directory means it was deleted or the
        // art_base is wrong. Asserted rather than skipped: a bare `return` here
        // made both checks below vanish from the run while the suite still
        // reported green, which is the one thing a content gate must never do.
        if (declared.length === 0) {
          expect(existsSync(dir), 'no panel declares art, but ' + base + ' exists').toBe(false)
          return
        }
        expect(existsSync(dir), 'art_base does not exist: public' + base).toBe(true)
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
          for (const pick of [0, 1]) {
            let overlaid = 0
            let totalBubbles = 0
            for (const panel of built.panels) {
              for (const b of visibleBubbles(panel, answerAll(built.panels, pick))) {
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
            expect(overlaid / Math.max(1, totalBubbles), 'bubbles fall out of the art at ' + width + 'px on branch ' + pick)
              .toBeGreaterThanOrEqual(FLOOR[width] == null ? 1 : FLOOR[width])
          }
        }
      })

      it('is completable: every gate is answerable and the last panel ends it', () => {
        // Both branches have to reach the end — a `when` bubble that only ever
        // appears on option 0 would otherwise hide a dead end on option 1.
        for (const pick of [0, 1]) {
          const answered = answerAll(built.panels, pick)
          expect(revealLimit(built.panels, answered), 'branch ' + pick + ' stops early').toBe(built.panels.length - 1)
          expect(isEpisodeComplete(built.panels, answered, built.panels.length - 1)).toBe(true)
        }
        // …and NOT completable by scrolling past an unanswered choice.
        if (built.panels.some(p => p.choice)) {
          expect(isEpisodeComplete(built.panels, {}, built.panels.length - 1)).toBe(false)
        }
      })

      // ── Vocabulary ──────────────────────────────────────────────────────
      const key = ep.language + '|' + ep.system + '|' + ep.level
      const vocabMap = vocabMapFor(key)

      // The four checks below are the reason this file exists — they are what
      // proves the episode is readable at its level. If the snapshot key ever
      // stops matching (a renamed system, a new level), they must FAIL rather
      // than quietly disappear and let the suite report green on an episode
      // nobody validated.
      it('has a vocabulary snapshot to validate the episode against', () => {
        expect(vocabMap, 'no vocabulary snapshot for ' + key).toBeTruthy()
      })

      const matcher = vocabMap ? buildVocabMatcher(vocabMap, ep.language) : null
      const names = CHARACTER_READINGS[ep.language] || {}
      // Guarded so a missing snapshot surfaces as the one clear failure above
      // instead of four confusing ones underneath it.
      if (!matcher) return

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
        // Each episode names its own `anchor_word` — the multi-character word the
        // episode leans on hardest, which must survive segmentation as ONE token
        // and arrive with a reading. This is the "tap this word" promise; a
        // segmenter change that splits it would break the point of the format,
        // and a per-episode anchor is what keeps that check meaningful as the
        // season grows past the one episode it was written for.
        const anchor = ep.anchor_word
        expect(anchor, 'no anchor_word declared').toBeTruthy()
        expect(anchor.length, 'a one-character anchor proves nothing').toBeGreaterThan(1)
        const target = lines.find(l => l.indexOf(anchor) !== -1)
        expect(target, 'no line contains the anchor ' + anchor).toBeTruthy()
        const tokens = segmentLine(splitSpeaker(target).text, matcher, names, new Set(), segmenter)
        const hit = tokens.find(t => t.text === anchor)
        expect(hit, 'segmentation split ' + anchor).toBeTruthy()
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
