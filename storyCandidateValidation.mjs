// Candidate validator — the deterministic gate every generated story must pass
// before it can be staged (FAB-10). Given a candidate and its manifest, this
// decides PASS or FAIL from code alone: no LLM opinion, no network, no clock.
//
// What it owns (factual constraints):
//   - manifest vocabulary: every target present, occurrences within bounds
//   - difficulty: out-of-level and unknown vocabulary within the manifest caps
//   - structure: title, content, length, speakers, English alignment, series
//     metadata, forbidden words
//   - repetition: duplicated lines, repeated-trigram concentration
//   - duplicates: essentially-copied content FAILs; look-alikes WARN
//     (thresholds calibrated against the real corpus — see
//     docs/audits/story-defaults-calibration.json)
//
// What it deliberately does NOT own: whether the story is GOOD. Naturalness
// and coherence are the optional LLM critique stage's job (storyGenPipeline),
// which runs after this gate and can never overrule it.
//
// All vocabulary interpretation comes from the canonical engine via
// storyCorpusCalibration.analyzeStory (calculateStoryReadability +
// segmentLine from src/storyReading.js) — the reader, the FAB-5 audit, the
// calibration and this validator agree about which words a story contains by
// construction.
//
// Output is machine-readable ({ verdict, failures, warnings, metrics }) with
// stable failure codes; formatValidation renders the concise human summary.

import { analyzeStory, contentSimilarity, cjkLength } from './storyCorpusCalibration.mjs'
import { splitSpeaker } from './src/storyReading.js'
import { validateManifest, NEAR_DUPLICATE_THRESHOLDS } from './storyManifestPlanner.mjs'

export const VALIDATOR_VERSION = 'fab10-validator@2'

const MAX_TITLE_CHARS = 40

// Corpus evidence (2026-08): healthy stories almost never repeat a line
// (median and p75 are 0 at every level); a single repeat exists in a couple of
// legitimate refrain stories. So one repeated line is a warning, two or more
// fail.
const REPEATED_LINE_FAIL = 2

export function validateCandidate(candidate, { manifest, vocabMap, corpus = [] } = {}) {
  const failures = []
  const warnings = []
  const fail = (code, message, data) => failures.push({ code, message, ...(data ? { data } : {}) })
  const warn = (code, message, data) => warnings.push({ code, message, ...(data ? { data } : {}) })

  const mCheck = validateManifest(manifest)
  if (!mCheck.ok) {
    fail('invalid_manifest', 'manifest is invalid: ' + mCheck.problems.join('; '))
    return finish(failures, warnings, {})
  }

  const title = String((candidate && candidate.title) || '').trim()
  const content = String((candidate && candidate.content) || '')
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean)

  // ── Structure ──────────────────────────────────────────────────────────────
  if (!title) fail('invalid_title', 'missing title')
  else if (title.length > MAX_TITLE_CHARS || title.includes('\n')) {
    fail('invalid_title', 'title is malformed: ' + JSON.stringify(title.slice(0, 50)))
  }
  if (lines.length === 0 || cjkLength(content) === 0) {
    fail('invalid_content', 'content is empty or contains no Chinese text')
    return finish(failures, warnings, { lines: lines.length })
  }
  const { minLines, maxLines, maxLineChars } = manifest.length
  if (lines.length < minLines) fail('too_short', lines.length + ' lines (need ' + minLines + '-' + maxLines + ')')
  if (lines.length > maxLines) fail('too_long', lines.length + ' lines (need ' + minLines + '-' + maxLines + ')')
  const longLines = lines.filter(l => splitSpeaker(l).text.length > maxLineChars * 2)
  if (longLines.length > 0) {
    fail('line_too_long', longLines.length + ' line(s) beyond ' + (maxLineChars * 2) + ' characters', { lines: longLines.slice(0, 3) })
  }

  const allowedSpeakers = new Set([...(manifest.speakers || []), ...(manifest.extraNames || [])])
  const badSpeakers = new Set()
  for (const line of lines) {
    const { speaker } = splitSpeaker(line)
    if (speaker && !allowedSpeakers.has(speaker)) badSpeakers.add(speaker)
  }
  if (badSpeakers.size > 0) {
    fail('unknown_speaker', 'speakers outside the cast: ' + [...badSpeakers].join('、') + ' (allowed: ' + (manifest.speakers || []).join('、') + ')')
  }

  const english = String((candidate && candidate.englishContent) || '').trim()
  if (english) {
    const en = english.split('\n').map(l => l.trim()).filter(Boolean)
    if (en.length !== lines.length) {
      fail('english_misaligned', 'english has ' + en.length + ' lines, Chinese has ' + lines.length)
    }
  }

  if (manifest.series) {
    const s = manifest.series
    if (!s.key || !Number.isFinite(s.chapterIndex) || !Number.isFinite(s.chapterCount)
      || s.chapterIndex < 1 || s.chapterIndex > s.chapterCount) {
      fail('series_inconsistent', 'series metadata is inconsistent', { series: s })
    }
  }

  // ── Canonical analysis (one engine for everything below) ───────────────────
  const a = analyzeStory({ title, level: manifest.level, presentation: manifest.presentation, content }, vocabMap)

  const forbidden = (manifest.forbidden && manifest.forbidden.words) || []
  const foundForbidden = forbidden.filter(w => (a.counts.get(w) || 0) > 0 || content.includes(w))
  if (foundForbidden.length > 0) {
    fail('forbidden_word', 'forbidden vocabulary present: ' + foundForbidden.join('、'))
  }

  // ── Manifest vocabulary ────────────────────────────────────────────────────
  const targetCounts = {}
  for (const t of manifest.targets) {
    const n = a.counts.get(t.word) || 0
    targetCounts[t.word] = n
    if (n === 0) fail('missing_target', 'missing target: ' + t.word)
    else if (n < t.min) fail('target_below_min', t.word + ' appears ' + n + '× (need ' + t.min + '-' + t.max + ')')
    else if (n > t.max) fail('target_above_max', t.word + ' appears ' + n + '× (max ' + t.max + ') — reads as spam')
  }

  // ── Difficulty ─────────────────────────────────────────────────────────────
  const d = manifest.difficulty
  const pct = (x) => (x * 100).toFixed(1) + '%'
  // TEMPORARILY a warning, not a failure (validator@2, 2026-08-21): the
  // distinct-word cap of 3 came from the corpus p75, and five benchmark
  // rounds showed no free-tier model getting within 3x of it — while the
  // pedagogically decisive quantity, the SHARE of text a learner cannot
  // read, stays a hard gate below. Both metrics are recorded on every
  // candidate so the real distinct-word threshold can be set empirically
  // from human-reviewed successful stories, not guessed.
  if (a.outOfLevelDistinct > d.maxOutOfLevelDistinct) {
    warn('out_of_level_words', a.outOfLevelDistinct + ' distinct words above HSK ' + manifest.level + ' (advisory max ' + d.maxOutOfLevelDistinct + ')')
  }
  if (a.outOfLevelCharShare > d.maxOutOfLevelCharShare) {
    fail('out_of_level_share', 'out-of-level vocabulary: ' + pct(a.outOfLevelCharShare) + ' > ' + pct(d.maxOutOfLevelCharShare))
  }
  if (a.unknownDistinct > d.maxUnknownDistinct) {
    fail('unknown_words', a.unknownDistinct + ' unknown (non-vocabulary) runs (max ' + d.maxUnknownDistinct + '): ' + a.unknownRuns.slice(0, 10).join('、'))
  }
  if (a.unknownCharShare > d.maxUnknownCharShare) {
    fail('unknown_share', 'unknown text: ' + pct(a.unknownCharShare) + ' > ' + pct(d.maxUnknownCharShare))
  }

  // ── Repetition ─────────────────────────────────────────────────────────────
  if (a.repeatedLines >= REPEATED_LINE_FAIL) {
    fail('repeated_line', a.repeatedLines + ' duplicated lines')
  } else if (a.repeatedLines === 1) {
    warn('repeated_line', 'one duplicated line — fine for a refrain, worth a look')
  }
  const maxTri = (manifest.quality && manifest.quality.maxRepeatedTrigramShare) || 0.2
  if (a.repeatedTrigramShare > maxTri) {
    fail('repetition_excess', 'repeated phrasing: ' + pct(a.repeatedTrigramShare) + ' of trigrams recur (max ' + pct(maxTri) + ')')
  }

  // ── Duplicates against the corpus (and the batch's accepted candidates) ────
  const thresholds = (manifest.quality && manifest.quality.nearDuplicate) || NEAR_DUPLICATE_THRESHOLDS
  let nearest = null
  for (const other of corpus) {
    if (!other || !other.content) continue
    const sim = contentSimilarity(content, other.content)
    if (!nearest || sim.jaccard > nearest.jaccard) {
      nearest = { title: other.title, level: other.level, jaccard: round3(sim.jaccard), containment: round3(sim.containment) }
    }
    if (sim.jaccard >= thresholds.fail.jaccard || sim.containment >= thresholds.fail.containment) {
      fail('duplicate_of_existing', 'essentially a copy of "' + other.title + '" (jaccard ' + round3(sim.jaccard) + ', containment ' + round3(sim.containment) + ')')
      break
    }
  }
  if (nearest && failures.every(f => f.code !== 'duplicate_of_existing')
    && (nearest.jaccard >= thresholds.warn.jaccard || nearest.containment >= thresholds.warn.containment)) {
    warn('near_duplicate', 'resembles "' + nearest.title + '" (jaccard ' + nearest.jaccard + ', containment ' + nearest.containment + ')')
  }

  return finish(failures, warnings, {
    lines: lines.length,
    cjkChars: a.cjkChars,
    distinctVocab: a.distinctVocab,
    targetCounts,
    inLevelCoverage: round3(1 - a.outOfLevelCharShare - a.unknownCharShare),
    outOfLevelDistinct: a.outOfLevelDistinct,
    outOfLevelCharShare: round3(a.outOfLevelCharShare),
    unknownDistinct: a.unknownDistinct,
    unknownCharShare: round3(a.unknownCharShare),
    unknownRuns: a.unknownRuns.slice(0, 10),
    repeatedLines: a.repeatedLines,
    repeatedTrigramShare: round3(a.repeatedTrigramShare),
    nearestNeighbor: nearest,
    counts: a.counts,
  })
}

function round3(x) { return Math.round(x * 1000) / 1000 }

function finish(failures, warnings, metrics) {
  return {
    validatorVersion: VALIDATOR_VERSION,
    verdict: failures.length === 0 ? 'PASS' : 'FAIL',
    failures,
    warnings,
    metrics,
  }
}

// ── Editor preservation gate ─────────────────────────────────────────────────
// The duo-1 pilot proved prompt instructions alone do not keep an editor
// editing: both simplifications changed title AND plot. These checks compare
// the editor's OUTPUT against its INPUT and fail deterministically when the
// output is a different story:
//
//   - title_changed      the title must survive an edit byte-for-byte
//   - speaker_added      the editor may not introduce speakers the input
//                        lacked (unless allowNewSpeakers)
//   - speaker_lost       a cast member with >= 2 dialogue lines in the input
//                        must still speak in the output
//   - rewrite_detected   char-trigram containment below EDIT_SIMILARITY.fail —
//                        calibrated in docs/audits/edit-similarity-calibration.json:
//                        controlled faithful simplifications of 12 real corpus
//                        stories score 0.72-0.92 containment, the two observed
//                        duo-1 plot-rewrites score 0.04-0.08. The floor sits
//                        far below faithful editing (word substitution has
//                        room) and far above any observed rewrite. Provisional
//                        until human-reviewed successful edits refine it.
export const EDIT_SIMILARITY = {
  fail: { containment: 0.3 },
  warn: { containment: 0.5 },
}

function speakerCounts(content) {
  const counts = new Map()
  for (const raw of String(content || '').split('\n')) {
    const { speaker } = splitSpeaker(raw.trim())
    if (speaker) counts.set(speaker, (counts.get(speaker) || 0) + 1)
  }
  return counts
}

export function validateEdit(original, edited, { allowNewSpeakers = false, thresholds = EDIT_SIMILARITY } = {}) {
  const failures = []
  const warnings = []
  const fail = (code, message) => failures.push({ code, message })
  const warn = (code, message) => warnings.push({ code, message })

  const titleBefore = String((original && original.title) || '').trim()
  const titleAfter = String((edited && edited.title) || '').trim()
  if (titleBefore && titleAfter !== titleBefore) {
    fail('title_changed', 'the editor changed the title: "' + titleBefore + '" → "' + titleAfter + '"')
  }

  const before = speakerCounts(original && original.content)
  const after = speakerCounts(edited && edited.content)
  const added = [...after.keys()].filter(sp => !before.has(sp))
  if (added.length && !allowNewSpeakers) {
    fail('speaker_added', 'the editor introduced new speakers: ' + added.join('、'))
  }
  const lost = [...before.entries()].filter(([sp, n]) => n >= 2 && !after.has(sp)).map(([sp]) => sp)
  if (lost.length) {
    fail('speaker_lost', 'main speakers disappeared in the edit: ' + lost.join('、'))
  }

  const sim = contentSimilarity((original && original.content) || '', (edited && edited.content) || '')
  if (sim.containment < thresholds.fail.containment) {
    fail('rewrite_detected', 'the edit shares only ' + Math.round(sim.containment * 100) + '% of the original\'s text (floor ' + Math.round(thresholds.fail.containment * 100) + '%) — this is a different story, not an edit')
  } else if (sim.containment < thresholds.warn.containment) {
    warn('rewrite_detected', 'heavy edit: ' + Math.round(sim.containment * 100) + '% containment — check the plot survived')
  }

  return {
    ok: failures.length === 0,
    failures,
    warnings,
    metrics: {
      jaccard: Math.round(sim.jaccard * 1000) / 1000,
      containment: Math.round(sim.containment * 1000) / 1000,
      titleChanged: Boolean(titleBefore) && titleAfter !== titleBefore,
      speakersAdded: added,
      speakersLost: lost,
    },
  }
}

// The concise human summary next to the machine-readable result:
//   PASS            or   FAIL
//                        - missing target: 护照
//                        - out-of-level vocabulary: 14.2% > 8.0%
//                        warning: resembles "周末做什么" (jaccard 0.31, ...)
export function formatValidation(result) {
  const out = [result.verdict]
  for (const f of result.failures) out.push('- ' + f.message)
  for (const w of result.warnings) out.push('warning: ' + w.message)
  return out.join('\n')
}

// Serialization helper: `metrics.counts` is a Map (useful in-process for
// recordAcceptedCandidate); candidate files store plain JSON.
export function serializableValidation(result) {
  const { counts, ...metrics } = result.metrics || {}
  return { ...result, metrics }
}
