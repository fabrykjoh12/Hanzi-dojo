// Realized lexical density — the ground truth the plan-time bound is checked
// against (2026-08-27).
//
// The plan-time gate can only bound density: it knows a beat has A assisted
// words and N lines, so at least ceil(A/N) land in one sentence. What actually
// happens is a property of the Mandarin, and until a story exists there is no
// way to know it. This module reads a realized story the way the READER does —
// segmentLine through buildVocabMatcher, the same pass that renders taps — and
// reports, per line, how many distinct words the learner would have to tap.
//
// A "tap" is a word above the learner's level, or a word-like run the
// vocabulary does not carry at all. Proper names are never taps: the reader
// renders them as names. That is the same rule storyCorpusCalibration uses, so
// the two never disagree about what counts.
//
// Pure: no network, no fs, no clock.

import {
  buildVocabMatcher, segmentLine, storyNamesFor, particlesFor, segmenterFor,
} from './src/storyReading.js'

export const REALIZED_VERSION = 'fab9-realized@2'

const CJK = /[一-鿿]/
const cjkLength = (s) => [...String(s || '')].filter(ch => CJK.test(ch)).length
const isWordlike = (s) => cjkLength(s) > 0

// A speaker label is chrome, not a sentence the learner reads for meaning.
function splitSpeaker(line) {
  const m = String(line || '').match(/^([^:：]{1,12})[:：]\s*(.*)$/)
  return m ? { speaker: m[1], text: m[2] } : { speaker: null, text: String(line || '') }
}

/**
 * Per-line taps for a realized story.
 * Returns { lines: [{ line, text, taps, words }], maxPerLine, totalTaps, distinct }.
 */
export function realizedDensity({ content, vocabMap = {}, level, language = 'chinese' } = {}) {
  const raw = String(content || '').split('\n').map(l => l.trim()).filter(Boolean)
  const names = storyNamesFor(String(content || ''), vocabMap, language)
  const matcher = buildVocabMatcher(vocabMap, language)
  const particles = particlesFor(language)
  // The reader hands segmentLine a segmenter, and without one an unmatched
  // stretch comes back as ONE blob — "张纸。" instead of 张 / 纸 / 。 — which
  // counts two unknown characters plus a full stop as a single tap. The whole
  // point of this module is to see what the reader sees.
  const segmenter = segmenterFor(language)
  const distinct = new Set()
  const lines = raw.map((line, i) => {
    const { text } = splitSpeaker(line)
    const words = new Set()
    for (const tok of segmentLine(text, matcher, names, particles, segmenter)) {
      if (!isWordlike(tok.text) || tok.name) continue
      if (tok.vocab) {
        const wl = tok.vocab.level
        // Above the learner's level: the word is in the course, one tap away.
        if (Number.isFinite(wl) && Number.isFinite(level) && wl > level) words.add(tok.text)
        continue
      }
      // Not in the vocabulary at any level: the hardest kind of tap, because
      // there is nothing to show the learner.
      words.add(tok.text)
    }
    for (const w of words) distinct.add(w)
    return { line: i + 1, text, taps: words.size, words: [...words] }
  })
  return {
    version: REALIZED_VERSION,
    lines,
    maxPerLine: lines.reduce((n, l) => Math.max(n, l.taps), 0),
    totalTaps: lines.reduce((n, l) => n + l.taps, 0),
    distinct: distinct.size,
    distinctWords: [...distinct],
  }
}

/**
 * Compare the plan-time lower bound against what the writer actually produced.
 * A FALSE POSITIVE is the plan rejecting a story the Mandarin then wrote inside
 * the cap; a FALSE NEGATIVE is the plan admitting one that overloads a real
 * line. Only the second is dangerous — the first only costs a plan.
 */
export function compareDensity({ planned, realized, cap }) {
  const planRejects = Number.isFinite(planned) && planned > cap
  const realOver = realized.maxPerLine > cap
  return {
    planned,
    realizedMax: realized.maxPerLine,
    cap,
    planRejects,
    realOver,
    verdict: planRejects === realOver ? (realOver ? 'AGREE_REJECT' : 'AGREE_ACCEPT')
      : (planRejects ? 'FALSE_POSITIVE' : 'FALSE_NEGATIVE'),
    worstLines: realized.lines.filter(l => l.taps > cap).map(l => ({ line: l.line, taps: l.taps, words: l.words })),
  }
}
