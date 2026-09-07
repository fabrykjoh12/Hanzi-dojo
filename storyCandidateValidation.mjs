// Deterministic validation of a generated story candidate — FAB-10 (2026-08-31).
//
// A candidate is not a story until a program says it is. Nothing here asks a
// model anything: every verdict is computed from the candidate, its manifest
// and the vocabulary, so the same inputs always produce the same diagnostics
// and a rerun cannot talk itself into a different answer.
//
// THE ONE DEFINITION OF "KNOWN WORD"
//
// This module does not have one. Whether a word is present, and whether a token
// resolves at all, are answered by the canonical Reader engine —
// calculateStoryReadability and, through storyVocabAudit.publishable,
// segmentLine/buildVocabMatcher/storyNamesFor. That is deliberate and it is the
// whole point: storyValidation.mjs already mirrors the Reader's matcher in a
// second implementation, and a mirror is exactly where "validates" and "renders
// correctly" drift apart. A target word counts here only if the Reader would
// highlight it, and untappable text is untappable by the Reader's own segmenter.
//
// So a required word inside a longer compound does NOT count: if the text says
// 汽车 and the target is 车, the Reader renders one token 汽车 and the learner
// never meets 车 as itself. The diagnostic says so, naming the word that
// swallowed it, because that is the sentence the writer has to change.
//
// DIAGNOSTICS, NOT A BOOLEAN
//
// Every failure carries a machine code, the offending word or line, and whether
// it is repairable — enough for the retry loop to write targeted feedback
// instead of "try again". `accepted` is derived from the diagnostics, never set
// independently: there is no path that returns accepted while a diagnostic
// stands.
//
// Pure: no network, no fs, no clock, no LLM.

import { calculateStoryReadability, splitSpeaker } from './src/storyReading.js'
import { publishable } from './storyVocabAudit.mjs'
import { validateManifest } from './storyTargetManifest.mjs'

export const VALIDATION_VERSION = 'fab10-candidate@1'

export const DIAGNOSTIC = {
  // The candidate is not a story object at all.
  MALFORMED: 'MALFORMED',
  // It declares a band other than the one it was written for.
  BAND_MISMATCH: 'BAND_MISMATCH',
  // A required word the Reader does not resolve anywhere in the text.
  TARGET_MISSING: 'TARGET_MISSING',
  // Present, but fewer times than the manifest asks for.
  TARGET_UNDER_USED: 'TARGET_UNDER_USED',
  // Present far more often than a story would naturally use it.
  TARGET_STUFFED: 'TARGET_STUFFED',
  // The required words together dominate the text.
  TARGET_DENSITY: 'TARGET_DENSITY',
  // Text the Reader cannot resolve at all — the merged publishability rule.
  UNTAPPABLE_TEXT: 'UNTAPPABLE_TEXT',
  // Resolvable, but above the band this story is for.
  OUT_OF_BAND_VOCAB: 'OUT_OF_BAND_VOCAB',
  // A dialogue speaker outside the cast.
  UNKNOWN_SPEAKER: 'UNKNOWN_SPEAKER',
  LINE_COUNT: 'LINE_COUNT',
  LINE_TOO_LONG: 'LINE_TOO_LONG',
  TITLE_INVALID: 'TITLE_INVALID',
  // Too close to a story that already exists, or to one already accepted here.
  DUPLICATE: 'DUPLICATE',
}

// Which failures a targeted revision can plausibly fix, and which need a fresh
// draft. This is the retry loop's whole input: repairing a duplicate by editing
// it produces a slightly different duplicate.
export const REPAIRABLE = {
  [DIAGNOSTIC.MALFORMED]: false,
  [DIAGNOSTIC.BAND_MISMATCH]: false,
  [DIAGNOSTIC.DUPLICATE]: false,
  [DIAGNOSTIC.TARGET_MISSING]: true,
  [DIAGNOSTIC.TARGET_UNDER_USED]: true,
  [DIAGNOSTIC.TARGET_STUFFED]: true,
  [DIAGNOSTIC.TARGET_DENSITY]: true,
  [DIAGNOSTIC.UNTAPPABLE_TEXT]: true,
  [DIAGNOSTIC.OUT_OF_BAND_VOCAB]: true,
  [DIAGNOSTIC.UNKNOWN_SPEAKER]: true,
  [DIAGNOSTIC.LINE_COUNT]: true,
  [DIAGNOSTIC.LINE_TOO_LONG]: true,
  [DIAGNOSTIC.TITLE_INVALID]: true,
}

const CJK = /[一-鿿]/

/** Character trigrams, the unit both duplicate checks work in. */
export function trigrams(text) {
  const s = [...String(text || '')].filter(ch => CJK.test(ch)).join('')
  const out = new Set()
  for (let i = 0; i + 3 <= s.length; i += 1) out.add(s.slice(i, i + 3))
  return out
}

/**
 * How much two texts share, as Jaccard over character trigrams.
 *
 * Deterministic and cheap, and it survives the edits a repair loop makes:
 * changing a handful of words to fix coverage moves this a few points, while a
 * regenerated story about the same beats moves it a lot. No model is asked
 * whether two stories are "the same", because that answer would not be stable.
 */
export function similarity(a, b) {
  const A = trigrams(a)
  const B = trigrams(b)
  if (A.size === 0 || B.size === 0) return 0
  let shared = 0
  for (const g of A) if (B.has(g)) shared += 1
  return shared / (A.size + B.size - shared)
}

export const DUPLICATE_THRESHOLD = 0.5

/** The closest existing text, if it is too close. */
export function nearestDuplicate(content, corpus = [], threshold = DUPLICATE_THRESHOLD) {
  let best = null
  for (const other of corpus) {
    const text = typeof other === 'string' ? other : (other && other.content)
    if (!text) continue
    const score = similarity(content, text)
    if (!best || score > best.score) {
      best = { score, id: (other && other.id) || null, title: (other && other.title) || null }
    }
  }
  return best && best.score >= threshold ? best : null
}

const diag = (code, detail, extra = {}) => ({
  code,
  detail,
  repairable: REPAIRABLE[code] !== false,
  ...extra,
})

/**
 * Validate one candidate against its manifest.
 *
 * `corpus` is whatever the candidate must not duplicate — the published corpus,
 * plus the candidates already accepted in this batch.
 */
export function validateCandidate(candidate, {
  manifest,
  vocabMap = {},
  curriculum = null,
  language = 'chinese',
  corpus = [],
  duplicateThreshold = DUPLICATE_THRESHOLD,
} = {}) {
  validateManifest(manifest)

  const diagnostics = []
  const fail = (...args) => { diagnostics.push(diag(...args)) }
  const result = (summary = {}) => ({
    version: VALIDATION_VERSION,
    manifest: manifest.id,
    // Derived, never assigned: there is no branch that accepts with a
    // diagnostic standing.
    accepted: diagnostics.length === 0,
    diagnostics,
    summary,
  })

  // ── shape ────────────────────────────────────────────────────────────────
  // Checked first and returned on: every measurement below assumes text.
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    fail(DIAGNOSTIC.MALFORMED, 'candidate is not an object')
    return result()
  }
  const content = typeof candidate.content === 'string' ? candidate.content : ''
  if (!content.trim()) {
    fail(DIAGNOSTIC.MALFORMED, 'candidate has no content')
    return result()
  }
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) {
    fail(DIAGNOSTIC.MALFORMED, 'candidate content has no lines')
    return result()
  }

  const title = typeof candidate.title === 'string' ? candidate.title.trim() : ''
  const [titleMin, titleMax] = manifest.format.titleChars
  if (!title) {
    fail(DIAGNOSTIC.TITLE_INVALID, 'candidate has no title')
  } else if ([...title].length < titleMin || [...title].length > titleMax) {
    fail(DIAGNOSTIC.TITLE_INVALID,
      'title is ' + [...title].length + ' characters (allowed ' + titleMin + '-' + titleMax + ')',
      { title })
  }

  // A candidate that declares a level must declare the one it was written for.
  // Silently accepting an HSK 5 story from an HSK 3 manifest would file it
  // against the wrong band forever.
  if (candidate.level != null && candidate.level !== manifest.level) {
    fail(DIAGNOSTIC.BAND_MISMATCH,
      'candidate declares HSK ' + candidate.level + ', manifest targets HSK ' + manifest.level,
      { declared: candidate.level, expected: manifest.level })
  }

  // ── format ───────────────────────────────────────────────────────────────
  const [minLines, maxLines] = manifest.limits.lines
  if (lines.length < minLines || lines.length > maxLines) {
    fail(DIAGNOSTIC.LINE_COUNT,
      lines.length + ' lines (allowed ' + minLines + '-' + maxLines + ')',
      { lines: lines.length, min: minLines, max: maxLines })
  }

  const cast = manifest.format.speakers || []
  const badSpeakers = new Map()
  lines.forEach((raw, i) => {
    const { speaker, text } = splitSpeaker(raw)
    if (speaker && cast.length && cast.indexOf(speaker) === -1) {
      if (!badSpeakers.has(speaker)) badSpeakers.set(speaker, i + 1)
    }
    if ([...text].length > manifest.limits.maxLineChars) {
      fail(DIAGNOSTIC.LINE_TOO_LONG,
        'line ' + (i + 1) + ' is ' + [...text].length + ' characters (max ' + manifest.limits.maxLineChars + ')',
        { line: i + 1, chars: [...text].length })
    }
  })
  for (const [speaker, line] of badSpeakers) {
    fail(DIAGNOSTIC.UNKNOWN_SPEAKER,
      'speaker "' + speaker + '" on line ' + line + ' is not in the cast: ' + cast.join(', '),
      { speaker, line })
  }

  // ── the Reader's own reading of the text ─────────────────────────────────
  const readability = calculateStoryReadability({ content, vocabMap, cards: {}, language })
  const counts = readability.counts

  // Untappable text, through the merged content-integrity rule. Names resolved
  // by the Reader's own name path are already excluded there, so a legitimate
  // character costs nothing and an ordinary unknown word is not excused.
  const pub = publishable({ title, content }, { vocabMap, language, curriculum })
  for (const o of pub.offenders) {
    fail(DIAGNOSTIC.UNTAPPABLE_TEXT,
      '"' + o.run + '" x' + o.occurrences + ' does not resolve in the Reader (' + o.defect + ')',
      { word: o.run, occurrences: o.occurrences, defect: o.defect, layer: o.layer })
  }

  // ── the targets ──────────────────────────────────────────────────────────
  // Presence is the Reader's verdict, not a substring search. When a target is
  // absent, say whether it was swallowed by a longer word — that is the edit
  // the writer has to make, and "add 车" would be misleading advice for a text
  // that already says 汽车.
  const swallowedBy = (word) => {
    const hosts = []
    for (const [w] of counts) if (w !== word && w.includes(word)) hosts.push(w)
    return hosts.sort()
  }

  let targetOccurrences = 0
  const perTarget = []
  for (const t of manifest.required) {
    const n = counts.get(t.word) || 0
    targetOccurrences += n
    perTarget.push({ word: t.word, cohort: t.cohort, occurrences: n, required: t.minOccurrences })
    if (n === 0) {
      const hosts = swallowedBy(t.word)
      fail(DIAGNOSTIC.TARGET_MISSING,
        'required word ' + t.word + ' (' + t.cohort + ') never resolves as its own token'
        + (hosts.length ? ' — it appears only inside ' + hosts.join('、') : ''),
        { word: t.word, cohort: t.cohort, occurrences: 0, required: t.minOccurrences, insideOnly: hosts })
      continue
    }
    if (n < t.minOccurrences) {
      fail(DIAGNOSTIC.TARGET_UNDER_USED,
        'required word ' + t.word + ' appears ' + n + ' time(s), needs ' + t.minOccurrences,
        { word: t.word, cohort: t.cohort, occurrences: n, required: t.minOccurrences })
    }
    if (n > manifest.limits.maxOccurrencesPerTarget) {
      fail(DIAGNOSTIC.TARGET_STUFFED,
        'required word ' + t.word + ' appears ' + n + ' times (ceiling ' + manifest.limits.maxOccurrencesPerTarget + ')',
        { word: t.word, occurrences: n, ceiling: manifest.limits.maxOccurrencesPerTarget })
    }
  }

  let totalOccurrences = 0
  for (const [, n] of counts) totalOccurrences += n
  const share = totalOccurrences ? targetOccurrences / totalOccurrences : 0
  if (totalOccurrences > 0 && share > manifest.limits.maxTargetShare) {
    fail(DIAGNOSTIC.TARGET_DENSITY,
      'required words are ' + Math.round(share * 100) + '% of the resolvable text (max '
      + Math.round(manifest.limits.maxTargetShare * 100) + '%) — this reads as a drill, not a story',
      { share: Math.round(share * 1000) / 1000, max: manifest.limits.maxTargetShare })
  }

  // ── the band boundary ────────────────────────────────────────────────────
  // These words DO resolve — the learner can tap them — but they are above the
  // band, so they are budgeted rather than banned.
  const maxLevel = manifest.allowedVocabulary.maxLevel
  const outOfBand = []
  let outOfBandOccurrences = 0
  for (const [word, n] of counts) {
    const row = vocabMap[word]
    const lvl = row && Number.isFinite(row.level) ? row.level : null
    if (lvl != null && lvl > maxLevel) {
      outOfBand.push({ word, level: lvl, occurrences: n })
      outOfBandOccurrences += n
    }
  }
  outOfBand.sort((a, b) => (b.occurrences - a.occurrences) || (a.word < b.word ? -1 : 1))
  if (outOfBand.length > manifest.limits.maxOutOfBandDistinct) {
    fail(DIAGNOSTIC.OUT_OF_BAND_VOCAB,
      outOfBand.length + ' distinct words above HSK ' + maxLevel + ' (max '
      + manifest.limits.maxOutOfBandDistinct + '): '
      + outOfBand.slice(0, 12).map(o => o.word + '(HSK' + o.level + ')').join('、'),
      { distinct: outOfBand.length, max: manifest.limits.maxOutOfBandDistinct, words: outOfBand.slice(0, 20) })
  } else if (Number.isInteger(manifest.limits.maxOutOfBandOccurrences)
    && outOfBandOccurrences > manifest.limits.maxOutOfBandOccurrences) {
    fail(DIAGNOSTIC.OUT_OF_BAND_VOCAB,
      outOfBandOccurrences + ' occurrences of above-band words (max '
      + manifest.limits.maxOutOfBandOccurrences + ')',
      { occurrences: outOfBandOccurrences, max: manifest.limits.maxOutOfBandOccurrences, words: outOfBand.slice(0, 20) })
  }

  // ── duplication ──────────────────────────────────────────────────────────
  const dup = nearestDuplicate(content, corpus, duplicateThreshold)
  if (dup) {
    fail(DIAGNOSTIC.DUPLICATE,
      'shares ' + Math.round(dup.score * 100) + '% of its trigrams with '
      + (dup.title ? '"' + dup.title + '"' : 'an existing story') + (dup.id ? ' (' + dup.id + ')' : ''),
      { score: Math.round(dup.score * 1000) / 1000, id: dup.id, title: dup.title })
  }

  return result({
    lines: lines.length,
    uniqueWords: readability.totalUnique,
    resolvableOccurrences: totalOccurrences,
    targets: perTarget,
    targetShare: totalOccurrences ? Math.round(share * 1000) / 1000 : 0,
    outOfBandDistinct: outOfBand.length,
    outOfBandOccurrences,
    untappableOccurrences: pub.occurrences,
  })
}

/** Human-readable, and the same text the repair prompt is built from. */
export function formatValidation(v) {
  if (v.accepted) return 'ACCEPTED: ' + v.manifest
  const lines = ['FAILED: ' + v.manifest]
  for (const d of v.diagnostics) lines.push('  ' + d.code + ': ' + d.detail)
  return lines.join('\n')
}
